import dotenv from 'dotenv';
import { Settings, EmailLog } from './models.js';

dotenv.config();

// Module-level token cache
let tokenCache = { token: null, expiresAt: 0 };

/**
 * Logs an error to the EmailLog collection.
 */
async function logOutlookError(source, message, details = '', emailId = '') {
  try {
    await EmailLog.create({ level: 'error', source, message, details, emailId });
  } catch (e) {
    console.error('Failed to write email log:', e.message);
  }
}

/**
 * Invalidates the cached access token so the next call fetches a fresh one.
 */
export function invalidateTokenCache() {
  tokenCache = { token: null, expiresAt: 0 };
}

/**
 * Retrieves a valid Microsoft Graph API access token using the OAuth 2.0 Client Credentials Flow.
 * Caches the token and returns it if still valid. Use forceRefresh to bypass cache.
 */
export async function getOutlookAccessToken(forceRefresh = false) {
  // Return cached token if still valid and not forcing refresh
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {
    console.error('Failed to load settings from DB for Outlook token, using fallback env:', e.message);
  }

  const clientId = settings?.outlookClientId || process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = settings?.outlookClientSecret || process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = settings?.outlookTenantId || process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'common';

  if (!clientId || !clientSecret || !tenantId) {
    console.warn('Outlook client credentials are not fully configured.');
    return null;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Microsoft Auth Token exchange failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    // Cache with 50 seconds before actual expiry (tokens typically last 3600s)
    tokenCache = {
      token: accessToken,
      expiresAt: Date.now() + 3500 * 1000
    };

    return accessToken;
  } catch (error) {
    console.error('Error fetching Outlook access token:', error.message);
    await logOutlookError('outlook-auth', error.message);
    throw error;
  }
}

/**
 * Helper that makes a Graph API request with automatic 401 retry.
 * On a 401 response, invalidates the token cache and retries once with a fresh token.
 */
async function graphApiRequest(url, options, emailUser, retried = false) {
  const response = await fetch(url, options);

  if (response.status === 401 && !retried) {
    console.warn('Graph API returned 401, refreshing token and retrying...');
    invalidateTokenCache();
    const freshToken = await getOutlookAccessToken(true);
    if (!freshToken) {
      throw new Error('Failed to obtain a fresh access token after 401.');
    }
    const newOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${freshToken}`
      }
    };
    return graphApiRequest(url, newOptions, emailUser, true);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Microsoft Graph API error: ${response.status} - ${errText}`);
  }

  return response;
}

/**
 * Retrieves unread messages with PDF attachments from the specified user's mailbox.
 */
export async function listOutlookMessages(accessToken, emailUser) {
  if (!emailUser) {
    throw new Error('Sourcing email user must be specified to query Microsoft Graph.');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailUser)}/mailFolders/inbox/messages?$filter=hasAttachments eq true and isRead eq false&$expand=attachments&$select=id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments&$top=10`;

  try {
    const response = await graphApiRequest(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'outlook.body-content-type="text"'
      }
    }, emailUser);

    const data = await response.json();
    const rawMessages = data.value || [];
    const formattedMessages = [];

    for (const msg of rawMessages) {
      const attachments = msg.attachments || [];
      const pdfAttachments = attachments
        .filter(att => att['@odata.type'] === '#microsoft.graph.fileAttachment' && 
                       (att.contentType === 'application/pdf' || att.name?.toLowerCase().endsWith('.pdf')))
        .map(att => ({
          attachmentId: att.id,
          filename: att.name || `resume-${msg.id}.pdf`,
          contentType: att.contentType || 'application/pdf',
          size: att.size || 0
        }));

      if (pdfAttachments.length > 0) {
        formattedMessages.push({
          id: msg.id,
          subject: msg.subject || '(No Subject)',
          from: msg.from?.emailAddress?.name 
            ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` 
            : msg.from?.emailAddress?.address || 'Unknown Sender',
          date: msg.receivedDateTime || new Date().toISOString(),
          snippet: msg.bodyPreview || '',
          body: msg.body?.content || '',
          attachments: pdfAttachments
        });
      }
    }

    return formattedMessages;
  } catch (error) {
    console.error(`Error listing messages for user ${emailUser} via Microsoft Graph:`, error.message);
    await logOutlookError('outlook-poll', `List messages failed: ${error.message}`);
    throw error;
  }
}

/**
 * Retrieves ALL unread messages (not just ones with PDF attachments) from the specified user's mailbox.
 * Returns all attachments, not just PDFs.
 */
export async function listAllOutlookMessages(accessToken, emailUser) {
  if (!emailUser) {
    throw new Error('Sourcing email user must be specified to query Microsoft Graph.');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailUser)}/mailFolders/inbox/messages?$filter=isRead eq false&$expand=attachments&$select=id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments&$top=25`;

  try {
    const response = await graphApiRequest(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'outlook.body-content-type="text"'
      }
    }, emailUser);

    const data = await response.json();
    const rawMessages = data.value || [];
    const formattedMessages = [];

    for (const msg of rawMessages) {
      const attachments = (msg.attachments || [])
        .filter(att => att['@odata.type'] === '#microsoft.graph.fileAttachment')
        .map(att => ({
          attachmentId: att.id,
          filename: att.name || `attachment-${msg.id}`,
          contentType: att.contentType || 'application/octet-stream',
          size: att.size || 0
        }));

      formattedMessages.push({
        id: msg.id,
        subject: msg.subject || '(No Subject)',
        from: msg.from?.emailAddress?.name 
          ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` 
          : msg.from?.emailAddress?.address || 'Unknown Sender',
        date: msg.receivedDateTime || new Date().toISOString(),
        snippet: msg.bodyPreview || '',
        body: msg.body?.content || '',
        hasAttachments: msg.hasAttachments || false,
        attachments
      });
    }

    return formattedMessages;
  } catch (error) {
    console.error(`Error listing all messages for user ${emailUser} via Microsoft Graph:`, error.message);
    await logOutlookError('outlook-poll', `List all messages failed: ${error.message}`);
    throw error;
  }
}

/**
 * Downloads a specific attachment's content bytes from an Outlook email message.
 */
export async function getOutlookAttachmentData(accessToken, emailUser, messageId, attachmentId) {
  if (!emailUser) {
    throw new Error('Sourcing email user must be specified.');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailUser)}/messages/${messageId}/attachments/${attachmentId}`;

  try {
    const response = await graphApiRequest(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }, emailUser);

    const att = await response.json();
    if (!att.contentBytes) {
      throw new Error(`No contentBytes in attachment ${attachmentId} for message ${messageId}`);
    }

    return {
      filename: att.name || `resume-${messageId}.pdf`,
      buffer: Buffer.from(att.contentBytes, 'base64')
    };
  } catch (error) {
    console.error(`Error downloading attachment ${attachmentId} for message ${messageId} via Microsoft Graph:`, error.message);
    await logOutlookError('outlook-poll', `Attachment download failed: ${error.message}`, '', messageId);
    throw error;
  }
}

/**
 * Marks an Outlook email message as read.
 */
export async function markOutlookEmailAsRead(accessToken, emailUser, messageId) {
  if (!emailUser) {
    throw new Error('Sourcing email user must be specified.');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailUser)}/messages/${messageId}`;

  try {
    const response = await graphApiRequest(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isRead: true
      })
    }, emailUser);

    return true;
  } catch (error) {
    console.error(`Error marking message ${messageId} read via Microsoft Graph:`, error.message);
    throw error;
  }
}

/**
 * Sends an email from the configured Outlook mailbox.
 */
export async function sendOutlookEmail(accessToken, emailUser, { to, subject, body }) {
  if (!emailUser) {
    throw new Error('Sourcing email user must be specified.');
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailUser)}/sendMail`;

  try {
    const response = await graphApiRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject: subject,
          body: {
            contentType: 'Text',
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        }
      })
    }, emailUser);

    return true;
  } catch (error) {
    console.error(`Error sending email to ${to} via Microsoft Graph:`, error.message);
    await logOutlookError('outlook-poll', `Send email failed: ${error.message}`);
    throw error;
  }
}
