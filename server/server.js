import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { ImapFlow } from 'imapflow';

// Google OAuth imports deleted
import { 
  fetchIMAPEmails, 
  markIMAPEmailAsRead, 
  getIMAPAttachmentData 
} from './imapSourcing.js';
import { parseResume, scoreCandidate, scoreCandidateByOwnCategory, generateTags, generateJobDescription, generateQuestionsForCandidate } from './geminiParser.js';
import { extractTextFromPDF, extractTextFromFile } from './parser.js';
import { searchIndex } from './searchIndex.js';
import { Candidate, Job, Settings, ProcessedEmail, IngestionLog } from './models.js';
import {
  getOutlookAccessToken,
  listOutlookMessages,
  listAllOutlookMessages,
  getOutlookAttachmentData,
  markOutlookEmailAsRead,
  sendOutlookEmail,
  invalidateTokenCache
} from './outlookApi.js';
import { categorizeEmail } from './emailCategorizer.js';
import { EmailLog } from './models.js';
import { loadVectorIndex, indexCandidate, removeCandidate, indexAllCandidates, searchResumes, ragAnswer, getRAGStatus } from './ragService.js';

dotenv.config();

// Global trackers for background email connection checks
// success: null = never checked, true = last check OK, false = last check failed
let lastOutlookConnectionStatus = {
  success: null,
  error: null,
  lastChecked: null
};

let lastGmailConnectionStatus = {
  success: null,
  error: null,
  lastChecked: null
};
const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');


async function getEmailConfig() {
  const settings = await Settings.findById('global');
  if (settings) {
    const provider = settings.emailProvider ?? 'gmail';
    let pass = settings.emailPassword ?? '';
    if (provider === 'gmail' && pass) {
      pass = pass.replace(/\s+/g, '');
    }
    return {
      provider,
      user: settings.emailUser ?? '',
      pass,
      sourcingAgentActive: settings.sourcingAgentActive !== false,
      outlookClientId: settings.outlookClientId ?? '',
      outlookClientSecret: settings.outlookClientSecret ?? '',
      outlookTenantId: settings.outlookTenantId ?? '',
      outlookUserEmail: settings.outlookUserEmail ?? ''
    };
  }
  const provider = 'gmail';
  let pass = process.env.GMAIL_APP_PASSWORD || '';
  if (pass) {
    pass = pass.replace(/\s+/g, '');
  }
  return {
    provider,
    user: process.env.GMAIL_USER_EMAIL || '',
    pass,
    sourcingAgentActive: true,
    outlookClientId: process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '',
    outlookClientSecret: process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '',
    outlookTenantId: process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID || '',
    outlookUserEmail: process.env.OUTLOOK_USER_EMAIL || ''
  };
}

async function testConnectionInBackground() {
  const emailConfig = await getEmailConfig();
  if (emailConfig.provider === 'outlook') {
    const clientId = emailConfig.outlookClientId;
    const clientSecret = emailConfig.outlookClientSecret;
    const tenantId = emailConfig.outlookTenantId;
    const userEmail = emailConfig.outlookUserEmail;

    if (!clientId || !clientSecret || !tenantId || !userEmail) {
      return;
    }
    try {
      invalidateTokenCache();
      const accessToken = await getOutlookAccessToken(true);
      const testUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount`;
      const testResponse = await fetch(testUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (testResponse.ok) {
        lastOutlookConnectionStatus = { success: true, error: null, lastChecked: new Date() };
      } else {
        const errText = await testResponse.text();
        lastOutlookConnectionStatus = { success: false, error: errText, lastChecked: new Date() };
      }
    } catch (error) {
      lastOutlookConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
    }
  } else {
    // Gmail IMAP
    const user = emailConfig.user;
    const pass = emailConfig.pass;
    if (!user || !pass) {
      return;
    }
    try {
      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user, pass },
        logger: false
      });
      await client.connect();
      await client.logout();
      lastGmailConnectionStatus = { success: true, error: null, lastChecked: new Date() };
    } catch (error) {
      const errMsg = error.responseText ? `${error.message}: ${error.responseText}` : error.message;
      lastGmailConnectionStatus = { success: false, error: errMsg, lastChecked: new Date() };
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
  .then(async () => {
    console.log('Connected to MongoDB');
    // Build search index
    const candidates = await Candidate.find();
    if (candidates.length > 0) {
      searchIndex.buildIndex(candidates);
    }
    // Initialize RAG vector index
    loadVectorIndex().then(count => {
      console.log(`RAG vector index loaded: ${count} chunks in memory.`);
      if (count === 0 && candidates.length > 0) {
        console.log('First run detected. Starting background RAG indexing...');
        indexAllCandidates((current, total) => {
          if (current % 5 === 0 || current === total) console.log(`RAG indexing progress: ${current}/${total}`);
        }).then(result => {
          console.log(`RAG indexing complete: ${result.indexed} candidates indexed, ${result.errors} errors.`);
        }).catch(err => console.error('RAG background indexing failed:', err.message));
      }
    }).catch(err => console.error('Failed to load RAG vector index:', err.message));
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Google OAuth token helpers deleted

async function sendSMTPMessage({ to, subject, body }) {
  const config = await getEmailConfig();
  if (!config.user || !config.pass) {
    throw new Error('Email credentials are not configured.');
  }

  let smtpConfig = {};
  if (config.provider === 'gmail') {
    smtpConfig = {
      service: 'gmail',
      auth: { user: config.user, pass: config.pass }
    };
  } else {
    smtpConfig = {
      service: config.provider,
      auth: { user: config.user, pass: config.pass }
    };
  }

  const transporter = nodemailer.createTransport(smtpConfig);
  return await transporter.sendMail({ from: config.user, to, subject, text: body });
}

/* ==========================================================================
   AUTHENTICATION ROUTES
   ========================================================================== */

// Google OAuth routes deleted

app.get('/api/auth/status', async (req, res) => {
  const emailConfig = await getEmailConfig();
  const settings = await Settings.findById('global');
  
  const imapConfigured = !!(emailConfig.user && emailConfig.pass);
  const outlookConfigured = !!(emailConfig.outlookClientId && emailConfig.outlookClientSecret && emailConfig.outlookUserEmail);
  const isOutlookProvider = emailConfig.provider === 'outlook';
  
  // 'authenticated' is lenient: assume OK if configured and not yet proven broken
  // 'connected' is strict: only true after an actual successful check
  res.json({ 
    authenticated: isOutlookProvider
      ? (outlookConfigured && (lastOutlookConnectionStatus.success === true || lastOutlookConnectionStatus.lastChecked === null))
      : (imapConfigured && (lastGmailConnectionStatus.success === true || lastGmailConnectionStatus.lastChecked === null)),
    oauthConnected: false,
    imapConfigured,
    outlookConfigured,
    imapConnected: imapConfigured && lastGmailConnectionStatus.success === true,
    imapConnectionError: lastGmailConnectionStatus.error,
    outlookConnected: outlookConfigured && lastOutlookConnectionStatus.success === true,
    outlookConnectionError: lastOutlookConnectionStatus.error,
    email: isOutlookProvider ? emailConfig.outlookUserEmail : (emailConfig.user || ''),
    sourcingAgentActive: emailConfig.sourcingAgentActive,
    emailProvider: emailConfig.provider,
    aiProvider: settings?.aiProvider || 'gemini',
    geminiApiKeyConfigured: !!(settings?.geminiApiKey || process.env.GEMINI_API_KEY),
    openaiApiKeyConfigured: !!(settings?.openaiApiKey || process.env.OPENAI_API_KEY),
    claudeApiKeyConfigured: !!(settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Disconnected.' });
});

/* ==========================================================================
   RESUME PROCESSING CORE
   ========================================================================== */

async function processEmailAttachment(messageId, filename, buffer, emailConfig, provider = 'gmail') {
  // CRITICAL: Mark as processed FIRST using upsert to prevent race conditions.
  // If two poller ticks run simultaneously, only one will "win" this atomic upsert.
  // We check if the document already existed before to skip duplicate work.
  const processResult = await ProcessedEmail.updateOne(
    { messageId },
    { $setOnInsert: { messageId, processedAt: new Date() } },
    { upsert: true }
  );

  // If no new document was inserted, this email was already processed by another tick
  if (!processResult.upsertedId) {
    console.log(`Email ${messageId} already being processed or done. Skipping.`);
    return null;
  }

  const logId = `ingestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const ingestionLog = new IngestionLog({
    id: logId,
    fileName: filename,
    source: provider === 'outlook' ? 'outlook' : 'gmail',
    status: 'processing'
  });
  await ingestionLog.save().catch(e => console.error('Failed to create ingestion log:', e));

  let localFilePath = null;

  try {
    // Save PDF locally
    const localFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    localFilePath = path.join(UPLOADS_DIR, localFilename);
    fs.writeFileSync(localFilePath, buffer);

    console.log(`Extracting text from ${filename}...`);
    const pdfText = await extractTextFromFile(localFilePath, filename, null);

    console.log('Parsing resume with Gemini...');
    const parsedData = await parseResume(pdfText);

    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      const escapedEmail = escapeRegex(parsedData.email.trim());
      duplicate = await Candidate.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } });
    } else if (parsedData.name) {
      const escapedName = escapeRegex(parsedData.name.trim());
      duplicate = await Candidate.findOne({ name: { $regex: new RegExp(`^${escapedName}$`, 'i') } });
    }

    if (duplicate) {
      console.log(`Candidate with email ${parsedData.email || 'N/A'} (name: ${parsedData.name}) already exists. Skipping import.`);
      
      // Clean up temp file
      try {
        if (localFilePath && fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      } catch (err) {
        console.error('Failed to delete temp file for duplicate:', err);
      }

      await IngestionLog.updateOne(
        { id: logId },
        { 
          status: 'duplicate', 
          error: `Duplicate candidate: with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists.`
        }
      ).catch(e => console.error('Failed to update ingestion log:', e));

      try {
        if (provider === 'outlook') {
          const token = await getOutlookAccessToken();
          await markOutlookEmailAsRead(token, emailConfig.outlookUserEmail, messageId);
        } else {
          await markIMAPEmailAsRead(messageId, emailConfig);
        }
      } catch (e) {}
      return null;
    }

    console.log('Fetching settings...');
    let settings = await Settings.findById('global');

    console.log(`Scoring according to candidate's own category...`);
    const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);

    let job = await Job.findOne({ status: 'Active' });
    let jobId = job ? job.id : null;
    let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };

    if (job) {
      console.log(`Scoring against job: ${job.title}...`);
      scoringResult = await scoreCandidate(parsedData, job);
    }

    console.log('Generating tags...');
    const tagPreferences = settings ? settings.tagPreferences : [];
    let generatedTags = [];
    try {
      generatedTags = await generateTags(parsedData, job || { title: 'General Role', description: '' }, tagPreferences);
    } catch (e) {
      console.warn('Tag generation failed:', e.message);
    }

    const newCandidate = new Candidate({
      id: `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      name: parsedData.name || 'Unknown Candidate',
      email: parsedData.email || '',
      phone: parsedData.phone || '',
      linkedinUrl: parsedData.linkedinUrl || '',
      skills: parsedData.skills || [],
      experience: parsedData.experience || [],
      education: parsedData.education || [],
      tags: generatedTags,
      stage: 'Inbox',
      resumeUrl: `/uploads/${localFilename}`,
      resumeText: pdfText,
      matchScore: scoringResult.score || 0,
      matchingSkills: scoringResult.matchingSkills || [],
      missingSkills: scoringResult.missingSkills || [],
      matchExplanation: scoringResult.reasoning || '',
      ownCategoryScore: ownCategoryResult.score || 0,
      ownCategoryMatchingSkills: ownCategoryResult.matchingSkills || [],
      ownCategoryMissingSkills: ownCategoryResult.missingSkills || [],
      ownCategoryExplanation: ownCategoryResult.reasoning || '',
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
    });

    await newCandidate.save();

    // Update IngestionLog on success
    await IngestionLog.updateOne(
      { id: logId },
      { 
        status: 'success', 
        candidateId: newCandidate.id,
        candidateName: newCandidate.name,
        extractedData: parsedData
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));

    // Mark read in email
    try {
      if (provider === 'outlook') {
        const token = await getOutlookAccessToken();
        await markOutlookEmailAsRead(token, emailConfig.outlookUserEmail, messageId);
      } else {
        await markIMAPEmailAsRead(messageId, emailConfig);
      }
    } catch (e) {
      console.error(`Failed to mark email ${messageId} as read:`, e.message);
    }

    // Rebuild index
    const candidates = await Candidate.find();
    searchIndex.buildIndex(candidates);

    // Async RAG indexing (non-blocking)
    indexCandidate(newCandidate).catch(err => console.error('RAG index failed for', newCandidate.name, err.message));

    console.log(`Successfully imported: ${newCandidate.name}`);
    return newCandidate;
  } catch (error) {
    console.error(`Failed to process attachment ${filename}:`, error);
    
    // Clean up temp file on failure
    try {
      if (localFilePath && fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {}

    // Update IngestionLog on failure
    await IngestionLog.updateOne(
      { id: logId },
      { 
        status: 'failed', 
        error: error.message
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));
  }
}

let isEmailPolling = false;

async function runEmailPoller() {
  if (isEmailPolling) return;
  isEmailPolling = true;
  try {
    const emailConfig = await getEmailConfig();
    
    if (!emailConfig.sourcingAgentActive) return;

    const provider = emailConfig.provider;

    if (provider === 'outlook') {
      // Outlook Graph API polling
      if (!emailConfig.outlookClientId || !emailConfig.outlookClientSecret || !emailConfig.outlookUserEmail) return;

      console.log('Automated Poller: Checking for new resumes via Outlook (Microsoft Graph)...');
      
      try {
        const accessToken = await getOutlookAccessToken();
        const emailsList = await listOutlookMessages(accessToken, emailConfig.outlookUserEmail);
        lastOutlookConnectionStatus = { success: true, error: null, lastChecked: new Date() };

        for (const email of emailsList) {
          const alreadyProcessed = await ProcessedEmail.exists({ messageId: email.id });
          if (alreadyProcessed) continue;

          // Categorize email
          let category = 'Other';
          try {
            const catResult = await categorizeEmail({
              subject: email.subject,
              from: email.from,
              body: email.snippet || email.body,
              hasAttachments: email.attachments.length > 0
            });
            category = catResult.category;
            console.log(`Email categorized as: ${category} (confidence: ${catResult.confidence})`);
          } catch (catErr) {
            console.warn('Email categorization failed:', catErr.message);
          }

          // Only process Resume-category emails with PDF attachments
          if (category === 'Spam') {
            await ProcessedEmail.updateOne(
              { messageId: email.id },
              { $setOnInsert: { messageId: email.id, processedAt: new Date() } },
              { upsert: true }
            );
            continue;
          }

          for (const att of email.attachments) {
            if (att.contentType === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf')) {
              try {
                const freshToken = await getOutlookAccessToken();
                const attData = await getOutlookAttachmentData(freshToken, emailConfig.outlookUserEmail, email.id, att.attachmentId);
                await processEmailAttachment(email.id, attData.filename, attData.buffer, emailConfig, 'outlook');
              } catch (attErr) {
                console.error(`Failed to process Outlook attachment:`, attErr.message);
                await EmailLog.create({ level: 'error', source: 'outlook-poll', message: `Attachment processing failed: ${attErr.message}`, emailId: email.id });
              }
              break;
            }
          }

          await ProcessedEmail.updateOne(
            { messageId: email.id },
            { $setOnInsert: { messageId: email.id, processedAt: new Date() } },
            { upsert: true }
          );
        }
      } catch (outlookErr) {
        console.error('Outlook Poller Error:', outlookErr.message);
        lastOutlookConnectionStatus = { success: false, error: outlookErr.message, lastChecked: new Date() };
        await EmailLog.create({ level: 'error', source: 'outlook-poll', message: outlookErr.message }).catch(() => {});
      }
    } else {
      // Gmail IMAP polling (existing logic)
      const hasImapConfig = !!(emailConfig.user && emailConfig.pass);
      if (!hasImapConfig) return;

      console.log(`Automated Poller: Checking for new resumes via ${emailConfig.provider}...`);
      try {
        const emailsList = await fetchIMAPEmails(emailConfig);
        lastGmailConnectionStatus = { success: true, error: null, lastChecked: new Date() };

        for (const email of emailsList) {
          const alreadyProcessed = await ProcessedEmail.exists({ messageId: email.id });
          if (alreadyProcessed) continue;

          for (const att of email.attachments) {
            if (att.contentType === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf')) {
              const parts = att.attachmentId.split('-att-');
              const idx = parts[1] || '0';
              const imapAtt = await getIMAPAttachmentData(email.id, idx, emailConfig);
              const buffer = imapAtt.buffer;
              await processEmailAttachment(email.id, att.filename, buffer, emailConfig, 'gmail');
              break;
            }
          }
          
          await ProcessedEmail.updateOne(
            { messageId: email.id },
            { $setOnInsert: { messageId: email.id, processedAt: new Date() } },
            { upsert: true }
          );
        }
      } catch (gmailErr) {
        console.error('Gmail Poller Error:', gmailErr.message);
        const errMsg = gmailErr.responseText ? `${gmailErr.message}: ${gmailErr.responseText}` : gmailErr.message;
        lastGmailConnectionStatus = { success: false, error: errMsg, lastChecked: new Date() };
        await EmailLog.create({ level: 'error', source: 'poller', message: errMsg }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Automated Poller Error:', err.message);
    try { await EmailLog.create({ level: 'error', source: 'poller', message: err.message }); } catch(e) {}
  } finally {
    isEmailPolling = false;
  }
}

// Background Poller
setInterval(runEmailPoller, 30000);
runEmailPoller();

/* ==========================================================================
   API ROUTES
   ========================================================================== */

app.get('/api/gmail/emails', async (req, res) => {
  const emailConfig = await getEmailConfig();

  if (emailConfig.provider === 'outlook') {
    // Use Outlook Graph API
    if (!emailConfig.outlookClientId || !emailConfig.outlookClientSecret || !emailConfig.outlookUserEmail) {
      return res.status(401).json({ error: 'Outlook credentials not configured.' });
    }
    try {
      const accessToken = await getOutlookAccessToken();
      const fetchedEmails = await listOutlookMessages(accessToken, emailConfig.outlookUserEmail);
      lastOutlookConnectionStatus = { success: true, error: null, lastChecked: new Date() };
      
      const emailList = [];
      for (const email of fetchedEmails) {
        const alreadyProcessed = await ProcessedEmail.exists({ messageId: email.id });
        if (!alreadyProcessed) {
          emailList.push(email);
        }
      }
      
      return res.json({ emails: emailList });
    } catch (error) {
      console.error('Outlook fetch error:', error.message);
      lastOutlookConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
      return res.status(500).json({ error: error.message });
    }
  }

  // Gmail IMAP (existing logic)
  const hasImapConfig = !!(emailConfig.user && emailConfig.pass);
  if (!hasImapConfig) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const fetchedEmails = await fetchIMAPEmails(emailConfig);
    lastGmailConnectionStatus = { success: true, error: null, lastChecked: new Date() };
    
    const emailList = [];
    for (const email of fetchedEmails) {
      const alreadyProcessed = await ProcessedEmail.exists({ messageId: email.id });
      if (!alreadyProcessed) {
        emailList.push(email);
      }
    }
    res.json({ emails: emailList });
  } catch (error) {
    console.error('Gmail fetch error:', error.message);
    const errMsg = error.responseText ? `${error.message}: ${error.responseText}` : error.message;
    lastGmailConnectionStatus = { success: false, error: errMsg, lastChecked: new Date() };
    res.status(500).json({ error: errMsg });
  }
});

// Fetch raw attachment to preview PDF before parsing
app.get('/api/gmail/attachment/:messageId/:attachmentId', async (req, res) => {
  const { messageId, attachmentId } = req.params;
  const emailConfig = await getEmailConfig();

  if (emailConfig.provider === 'outlook') {
    try {
      const accessToken = await getOutlookAccessToken();
      const attData = await getOutlookAttachmentData(accessToken, emailConfig.outlookUserEmail, messageId, attachmentId);
      res.setHeader('Content-Type', 'application/pdf');
      res.send(attData.buffer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  // Gmail IMAP
  const hasImapConfig = !!(emailConfig.user && emailConfig.pass);
  if (!hasImapConfig) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const parts = attachmentId.split('-att-');
    const imapAtt = await getIMAPAttachmentData(messageId, parts[1] || '0', emailConfig);
    const buffer = imapAtt.buffer;
    res.setHeader('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual extraction trigger
app.post('/api/candidates/extract-gmail', async (req, res) => {
  const { messageId, attachmentId, jobId } = req.body;
  if (!messageId || !attachmentId) return res.status(400).json({ error: 'Missing parameters.' });
  
  const alreadyProcessed = await ProcessedEmail.exists({ messageId });
  if (alreadyProcessed) return res.status(400).json({ error: 'Email already processed.' });

  const emailConfig = await getEmailConfig();
  let filename, buffer;

  if (emailConfig.provider === 'outlook') {
    if (!emailConfig.outlookClientId || !emailConfig.outlookClientSecret || !emailConfig.outlookUserEmail) {
      return res.status(401).json({ error: 'Outlook credentials not configured.' });
    }
    try {
      const accessToken = await getOutlookAccessToken();
      const attData = await getOutlookAttachmentData(accessToken, emailConfig.outlookUserEmail, messageId, attachmentId);
      filename = attData.filename;
      buffer = attData.buffer;
    } catch (error) {
      return res.status(500).json({ error: `Outlook attachment download failed: ${error.message}` });
    }
  } else {
    const hasImapConfig = !!(emailConfig.user && emailConfig.pass);
    if (!hasImapConfig) return res.status(401).json({ error: 'Not authenticated.' });
    try {
      const parts = attachmentId.split('-att-');
      const imapAtt = await getIMAPAttachmentData(messageId, parts[1] || '0', emailConfig);
      filename = imapAtt.filename;
      buffer = imapAtt.buffer;
    } catch (error) {
      return res.status(500).json({ error: `Email attachment download failed: ${error.message}` });
    }
  }

  const logId = `ingestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const ingestionLog = new IngestionLog({
    id: logId,
    fileName: filename,
    source: emailConfig.provider === 'outlook' ? 'outlook' : 'gmail',
    status: 'processing'
  });
  await ingestionLog.save().catch(e => console.error('Failed to create ingestion log:', e));

  let localFilePath = null;

  try {
    const localFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    localFilePath = path.join(UPLOADS_DIR, localFilename);
    fs.writeFileSync(localFilePath, buffer);
    const pdfText = await extractTextFromFile(localFilePath, filename, null);
    const parsedData = await parseResume(pdfText);

    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      const escapedEmail = escapeRegex(parsedData.email.trim());
      duplicate = await Candidate.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } });
    } else if (parsedData.name) {
      const escapedName = escapeRegex(parsedData.name.trim());
      duplicate = await Candidate.findOne({ name: { $regex: new RegExp(`^${escapedName}$`, 'i') } });
    }

    if (duplicate) {
      // Clean up temp file
      try {
        if (localFilePath && fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      } catch (err) {
        console.error('Failed to delete temp file for duplicate:', err);
      }

      await IngestionLog.updateOne(
        { id: logId },
        { 
          status: 'duplicate', 
          error: `Duplicate candidate: with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists.`
        }
      ).catch(e => console.error('Failed to update ingestion log:', e));
      return res.status(409).json({ error: `Candidate with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists in the pipeline.` });
    }

    let settings = await Settings.findById('global');

    console.log(`Scoring according to candidate's own category...`);
    const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);

    let job = null;
    let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };

    if (jobId) {
      job = await Job.findOne({ id: jobId });
    }
    if (job) {
      console.log(`Scoring against job: ${job.title}...`);
      scoringResult = await scoreCandidate(parsedData, job);
    }

    let generatedTags = await generateTags(parsedData, job || { title: 'General Role', description: '' }, settings?.tagPreferences || []);

    const newCandidate = new Candidate({
      id: `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, jobId, name: parsedData.name || 'Unknown',
      email: parsedData.email || '', phone: parsedData.phone || '',
      linkedinUrl: parsedData.linkedinUrl || '',
      skills: parsedData.skills || [], experience: parsedData.experience || [],
      education: parsedData.education || [], tags: generatedTags, stage: 'Inbox',
      resumeUrl: `/uploads/${localFilename}`, resumeText: pdfText, 
      matchScore: scoringResult.score || 0,
      matchingSkills: scoringResult.matchingSkills || [], missingSkills: scoringResult.missingSkills || [],
      matchExplanation: scoringResult.reasoning || '', 
      ownCategoryScore: ownCategoryResult.score || 0,
      ownCategoryMatchingSkills: ownCategoryResult.matchingSkills || [],
      ownCategoryMissingSkills: ownCategoryResult.missingSkills || [],
      ownCategoryExplanation: ownCategoryResult.reasoning || '',
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
    });

    await newCandidate.save();

    await IngestionLog.updateOne(
      { id: logId },
      { 
        status: 'success', 
        candidateId: newCandidate.id,
        candidateName: newCandidate.name,
        extractedData: parsedData
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));

    await ProcessedEmail.create({ messageId });
    searchIndex.buildIndex(await Candidate.find());

    // Mark as read
    try {
      if (emailConfig.provider === 'outlook') {
        const token = await getOutlookAccessToken();
        await markOutlookEmailAsRead(token, emailConfig.outlookUserEmail, messageId);
      } else {
        await markIMAPEmailAsRead(messageId, emailConfig);
      }
    } catch (e) {}

    const candObj = newCandidate.toObject();
    res.json({
      ...candObj,
      candidate: candObj
    });
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (localFilePath && fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {}

    await IngestionLog.updateOne(
      { id: logId },
      { 
        status: 'failed', 
        error: error.message
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/candidates/upload', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No resume file uploaded.' });
  const { jobId, logId } = req.body;

  let activeLogId = logId;
  let existingLog = null;
  if (logId) {
    existingLog = await IngestionLog.findOne({ id: logId });
  }

  if (!existingLog) {
    activeLogId = `ingestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ingestionLog = new IngestionLog({
      id: activeLogId,
      fileName: req.file.originalname,
      source: 'manual',
      status: 'processing'
    });
    await ingestionLog.save().catch(e => console.error('Failed to create ingestion log:', e));
  } else {
    existingLog.status = 'processing';
    existingLog.timestamp = new Date();
    await existingLog.save().catch(e => console.error('Failed to update ingestion log:', e));
  }

  try {
    const pdfText = await extractTextFromFile(req.file.path, req.file.originalname, req.file.mimetype);
    const parsedData = await parseResume(pdfText);
    
    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      const escapedEmail = escapeRegex(parsedData.email.trim());
      duplicate = await Candidate.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } });
    } else if (parsedData.name) {
      const escapedName = escapeRegex(parsedData.name.trim());
      duplicate = await Candidate.findOne({ name: { $regex: new RegExp(`^${escapedName}$`, 'i') } });
    }

    if (duplicate) {
      await IngestionLog.updateOne(
        { id: activeLogId },
        { 
          status: 'duplicate', 
          error: `Duplicate candidate: with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists.`
        }
      ).catch(e => console.error('Failed to update ingestion log:', e));

      return res.status(409).json({
        error: `Candidate with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists in the pipeline.`,
        duplicate: true,
        candidate: duplicate,
        tempFile: req.file.filename,
        parsedData: parsedData,
        pdfText: pdfText,
        jobId: jobId || null,
        logId: activeLogId
      });
    }

    let settings = await Settings.findById('global');

    console.log(`Scoring according to candidate's own category...`);
    const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);

    let job = null;
    let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };

    if (jobId) {
      job = await Job.findOne({ id: jobId });
    }
    if (job) {
      console.log(`Scoring against job: ${job.title}...`);
      scoringResult = await scoreCandidate(parsedData, job);
    }

    let generatedTags = await generateTags(parsedData, job || { title: 'General', description: '' }, settings?.tagPreferences || []);

    const newCandidate = new Candidate({
      id: `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, jobId, name: parsedData.name || 'Unknown',
      email: parsedData.email || '', phone: parsedData.phone || '',
      linkedinUrl: parsedData.linkedinUrl || '',
      skills: parsedData.skills || [], experience: parsedData.experience || [],
      education: parsedData.education || [], tags: generatedTags, stage: 'Inbox',
      resumeUrl: `/uploads/${req.file.filename}`, resumeText: pdfText, 
      matchScore: scoringResult.score || 0,
      matchingSkills: scoringResult.matchingSkills || [], missingSkills: scoringResult.missingSkills || [],
      matchExplanation: scoringResult.reasoning || '', 
      ownCategoryScore: ownCategoryResult.score || 0,
      ownCategoryMatchingSkills: ownCategoryResult.matchingSkills || [],
      ownCategoryMissingSkills: ownCategoryResult.missingSkills || [],
      ownCategoryExplanation: ownCategoryResult.reasoning || '',
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
    });

    await newCandidate.save();

    await IngestionLog.updateOne(
      { id: activeLogId },
      { 
        status: 'success', 
        candidateId: newCandidate.id,
        candidateName: newCandidate.name,
        extractedData: parsedData
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));

    searchIndex.buildIndex(await Candidate.find());
    // Async RAG indexing (non-blocking)
    indexCandidate(newCandidate).catch(err => console.error('RAG index failed for', newCandidate.name, err.message));
    const candObj = newCandidate.toObject();
    res.json({
      ...candObj,
      candidate: candObj
    });
  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    await IngestionLog.updateOne(
      { id: activeLogId },
      { 
        status: 'failed', 
        error: error.message
      }
    ).catch(e => console.error('Failed to update ingestion log:', e));
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/candidates/upload/resolve', async (req, res) => {
  const { action, candidateId, tempFile, parsedData, pdfText, jobId, logId } = req.body;

  try {
    if (action === 'update') {
      const candidate = await Candidate.findOne({ id: candidateId });
      if (!candidate) {
        if (tempFile) {
          const tempPath = path.join(UPLOADS_DIR, tempFile);
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
        return res.status(404).json({ error: 'Candidate not found.' });
      }

      // Delete old file if exists
      if (candidate.resumeUrl) {
        const oldFilename = candidate.resumeUrl.replace('/uploads/', '');
        const oldFilepath = path.join(UPLOADS_DIR, oldFilename);
        if (fs.existsSync(oldFilepath) && oldFilename !== tempFile) {
          try { fs.unlinkSync(oldFilepath); } catch (e) {}
        }
      }

      // Update fields
      candidate.name = parsedData.name || candidate.name;
      candidate.email = parsedData.email || candidate.email;
      candidate.phone = parsedData.phone || candidate.phone;
      candidate.linkedinUrl = parsedData.linkedinUrl || candidate.linkedinUrl;
      candidate.skills = parsedData.skills || candidate.skills;
      candidate.experience = parsedData.experience || candidate.experience;
      candidate.education = parsedData.education || candidate.education;
      candidate.resumeText = pdfText || candidate.resumeText;
      if (tempFile) {
        candidate.resumeUrl = `/uploads/${tempFile}`;
      }
      if (jobId) {
        candidate.jobId = jobId;
      }

      let settings = await Settings.findById('global');

      // Re-score candidate
      const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);
      candidate.ownCategoryScore = ownCategoryResult.score || 0;
      candidate.ownCategoryMatchingSkills = ownCategoryResult.matchingSkills || [];
      candidate.ownCategoryMissingSkills = ownCategoryResult.missingSkills || [];
      candidate.ownCategoryExplanation = ownCategoryResult.reasoning || '';

      let job = null;
      let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };
      if (candidate.jobId) {
        job = await Job.findOne({ id: candidate.jobId });
      }
      if (job) {
        scoringResult = await scoreCandidate(parsedData, job);
      }
      candidate.matchScore = scoringResult.score || 0;
      candidate.matchingSkills = scoringResult.matchingSkills || [];
      candidate.missingSkills = scoringResult.missingSkills || [];
      candidate.matchExplanation = scoringResult.reasoning || '';

      // Re-generate tags
      try {
        const generatedTags = await generateTags(parsedData, job || { title: 'General', description: '' }, settings?.tagPreferences || []);
        candidate.tags = generatedTags;
      } catch (e) {
        console.warn('Tag generation failed during update:', e.message);
      }

      candidate.history.push({
        date: new Date().toISOString(),
        type: 'Updated',
        text: `Manual upload updated resume: ${tempFile ? tempFile.split('-').slice(2).join('-') : 'Updated'}`
      });

      await candidate.save();

      if (logId) {
        await IngestionLog.updateOne(
          { id: logId },
          { 
            status: 'success', 
            candidateId: candidate.id,
            candidateName: candidate.name,
            extractedData: parsedData,
            error: ''
          }
        ).catch(e => console.error('Failed to update ingestion log:', e));
      }

      searchIndex.buildIndex(await Candidate.find());
      // Async RAG indexing (non-blocking)
      indexCandidate(candidate).catch(err => console.error('RAG index failed for', candidate.name, err.message));
      const candObj = candidate.toObject();
      return res.json({
        ...candObj,
        candidate: candObj
      });

    } else if (action === 'remove') {
      const candidate = await Candidate.findOne({ id: candidateId });
      if (candidate) {
        if (candidate.resumeUrl) {
          const filename = candidate.resumeUrl.replace('/uploads/', '');
          const filepath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(filepath)) {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        }
        await Candidate.deleteOne({ id: candidateId });
      }

      // Delete the new temp file
      if (tempFile) {
        const tempPath = path.join(UPLOADS_DIR, tempFile);
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
      }

      if (logId) {
        await IngestionLog.updateOne(
          { id: logId },
          { 
            status: 'cancelled', 
            error: 'Duplicate candidate removed from pipeline.'
          }
        ).catch(e => console.error('Failed to update ingestion log:', e));
      }

      searchIndex.buildIndex(await Candidate.find());
      return res.json({ success: true, removed: true, candidateId });

    } else if (action === 'delete-before') {
      const candidate = await Candidate.findOne({ id: candidateId });
      if (candidate) {
        if (candidate.resumeUrl) {
          const filename = candidate.resumeUrl.replace('/uploads/', '');
          const filepath = path.join(UPLOADS_DIR, filename);
          if (fs.existsSync(filepath)) {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }
        }
        await Candidate.deleteOne({ id: candidateId });
        removeCandidate(candidateId).catch(err => console.error('RAG removal failed:', err.message));
      }

      let settings = await Settings.findById('global');
      const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);

      let job = null;
      let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };
      if (jobId) {
        job = await Job.findOne({ id: jobId });
      }
      if (job) {
        scoringResult = await scoreCandidate(parsedData, job);
      }

      let generatedTags = [];
      try {
        generatedTags = await generateTags(parsedData, job || { title: 'General', description: '' }, settings?.tagPreferences || []);
      } catch (e) {
        console.warn('Tag generation failed during resolve delete-before:', e.message);
      }

      const newCandidate = new Candidate({
        id: `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        jobId,
        name: parsedData.name || 'Unknown',
        email: parsedData.email || '',
        phone: parsedData.phone || '',
        linkedinUrl: parsedData.linkedinUrl || '',
        skills: parsedData.skills || [],
        experience: parsedData.experience || [],
        education: parsedData.education || [],
        tags: generatedTags,
        stage: 'Inbox',
        resumeUrl: tempFile ? `/uploads/${tempFile}` : '',
        resumeText: pdfText,
        matchScore: scoringResult.score || 0,
        matchingSkills: scoringResult.matchingSkills || [],
        missingSkills: scoringResult.missingSkills || [],
        matchExplanation: scoringResult.reasoning || '',
        ownCategoryScore: ownCategoryResult.score || 0,
        ownCategoryMatchingSkills: ownCategoryResult.matchingSkills || [],
        ownCategoryMissingSkills: ownCategoryResult.missingSkills || [],
        ownCategoryExplanation: ownCategoryResult.reasoning || '',
        comments: '',
        seniorityLevel: parsedData.seniorityLevel || 'Mid',
        hrQuestions: [],
        technicalQuestions: []
      });

      try {
        const qna = await generateQuestionsForCandidate(newCandidate, job);
        newCandidate.hrQuestions = qna.hrQuestions || [];
        newCandidate.technicalQuestions = qna.technicalQuestions || [];
      } catch (err) {
        console.error('LLM Q&A generation failed during resolve delete-before:', err.message);
      }

      newCandidate.history.push({
        date: new Date().toISOString(),
        type: 'Created',
        text: `Sourced candidate from email ingestion: ${tempFile ? tempFile.split('-').slice(2).join('-') : 'Created'}`
      });

      await newCandidate.save();

      if (logId) {
        await IngestionLog.updateOne(
          { id: logId },
          { 
            status: 'success', 
            candidateId: newCandidate.id,
            candidateName: newCandidate.name,
            extractedData: parsedData,
            error: ''
          }
        ).catch(e => console.error('Failed to update ingestion log:', e));
      }

      searchIndex.buildIndex(await Candidate.find());
      indexCandidate(newCandidate).catch(err => console.error('RAG index failed for', newCandidate.name, err.message));

      const candObj = newCandidate.toObject();
      return res.json({
        ...candObj,
        candidate: candObj
      });

    } else {
      if (parsedData) {
        let settings = await Settings.findById('global');
        const ownCategoryResult = await scoreCandidateByOwnCategory(parsedData);

        let job = null;
        let scoringResult = { score: 0, matchingSkills: [], missingSkills: [], reasoning: '' };
        if (jobId) {
          job = await Job.findOne({ id: jobId });
        }
        if (job) {
          scoringResult = await scoreCandidate(parsedData, job);
        }

        let generatedTags = [];
        try {
          generatedTags = await generateTags(parsedData, job || { title: 'General', description: '' }, settings?.tagPreferences || []);
        } catch (e) {
          console.warn('Tag generation failed during resolve create:', e.message);
        }

        const newCandidate = new Candidate({
          id: `candidate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          jobId,
          name: parsedData.name || 'Unknown',
          email: parsedData.email || '',
          phone: parsedData.phone || '',
          linkedinUrl: parsedData.linkedinUrl || '',
          skills: parsedData.skills || [],
          experience: parsedData.experience || [],
          education: parsedData.education || [],
          tags: generatedTags,
          stage: 'Inbox',
          resumeUrl: tempFile ? `/uploads/${tempFile}` : '',
          resumeText: pdfText,
          matchScore: scoringResult.score || 0,
          matchingSkills: scoringResult.matchingSkills || [],
          missingSkills: scoringResult.missingSkills || [],
          matchExplanation: scoringResult.reasoning || '',
          ownCategoryScore: ownCategoryResult.score || 0,
          ownCategoryMatchingSkills: ownCategoryResult.matchingSkills || [],
          ownCategoryMissingSkills: ownCategoryResult.missingSkills || [],
          ownCategoryExplanation: ownCategoryResult.reasoning || '',
          comments: '',
          seniorityLevel: parsedData.seniorityLevel || 'Mid',
          hrQuestions: [],
          technicalQuestions: []
        });

        try {
          const qna = await generateQuestionsForCandidate(newCandidate, job);
          newCandidate.hrQuestions = qna.hrQuestions || [];
          newCandidate.technicalQuestions = qna.technicalQuestions || [];
        } catch (err) {
          console.error('LLM Q&A generation failed during resolve create:', err.message);
        }

        newCandidate.history.push({
          date: new Date().toISOString(),
          type: 'Created',
          text: `Sourced candidate from email ingestion: ${tempFile ? tempFile.split('-').slice(2).join('-') : 'Created'}`
        });

        await newCandidate.save();

        if (logId) {
          await IngestionLog.updateOne(
            { id: logId },
            { 
              status: 'success', 
              candidateId: newCandidate.id,
              candidateName: newCandidate.name,
              extractedData: parsedData,
              error: ''
            }
          ).catch(e => console.error('Failed to update ingestion log:', e));
        }

        searchIndex.buildIndex(await Candidate.find());
        indexCandidate(newCandidate).catch(err => console.error('RAG index failed for', newCandidate.name, err.message));

        const candObj = newCandidate.toObject();
        return res.json({
          ...candObj,
          candidate: candObj
        });
      }

      if (tempFile) {
        const tempPath = path.join(UPLOADS_DIR, tempFile);
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
      }

      if (logId) {
        await IngestionLog.updateOne(
          { id: logId },
          { 
            status: 'cancelled', 
            error: 'Duplicate upload cancelled by user.'
          }
        ).catch(e => console.error('Failed to update ingestion log:', e));
      }

      return res.json({ success: true, cancelled: true });
    }
  } catch (error) {
    console.error('Failed to resolve duplicate upload:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/candidates', async (req, res) => {
  res.json(await Candidate.find());
});

app.delete('/api/candidates/:id', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ id: req.params.id });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });

    if (candidate.resumeUrl) {
      const filename = candidate.resumeUrl.replace('/uploads/', '');
      const filepath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filepath)) {
        try { fs.unlinkSync(filepath); } catch (e) {}
      }
    }

    await Candidate.deleteOne({ id: req.params.id });

    const candidates = await Candidate.find();
    searchIndex.buildIndex(candidates);

    // Remove from RAG index
    removeCandidate(req.params.id).catch(err => console.error('RAG removal failed:', err.message));

    res.json({ success: true, message: 'Candidate deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gmail/emails/:id/dismiss', async (req, res) => {
  try {
    const messageId = req.params.id;
    await ProcessedEmail.create({ messageId });
    res.json({ success: true, message: 'Email dismissed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/candidates/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;
    const candidate = await Candidate.findOne({ id: req.params.id });
    if (!candidate) return res.status(404).json({ error: 'Not found.' });

    const oldStage = candidate.stage;
    candidate.stage = stage;
    candidate.history.push({ date: new Date().toISOString(), type: 'StageChanged', text: `Moved from "${oldStage}" to "${stage}"` });
    
    await candidate.save();
    res.json(candidate);
  } catch (error) {
    console.error('Failed to change candidate stage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/candidates/:id/send-email', async (req, res) => {
  const { subject, body } = req.body;
  const emailConfig = await getEmailConfig();

  const candidate = await Candidate.findOne({ id: req.params.id });
  if (!candidate) return res.status(404).json({ error: 'Not found.' });
  if (!candidate.email) return res.status(400).json({ error: 'No email specified.' });

  try {
    if (emailConfig.provider === 'outlook' && emailConfig.outlookClientId && emailConfig.outlookClientSecret && emailConfig.outlookUserEmail) {
      const accessToken = await getOutlookAccessToken();
      await sendOutlookEmail(accessToken, emailConfig.outlookUserEmail, { to: candidate.email, subject, body });
    } else {
      const hasImapConfig = !!(emailConfig.user && emailConfig.pass);
      if (!hasImapConfig) return res.status(401).json({ error: 'Not authenticated.' });
      await sendSMTPMessage({ to: candidate.email, subject, body });
    }

    candidate.history.push({ date: new Date().toISOString(), type: 'EmailSent', text: `Sent email: "${subject}"` });
    await candidate.save();
    res.json({ success: true, candidate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/candidates/:id/generate-questions', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ id: req.params.id });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found.' });
    }

    let job = null;
    if (candidate.jobId) {
      job = await Job.findOne({ id: candidate.jobId });
    }

    let hrQuestions = [];
    let technicalQuestions = [];

    try {
      const qna = await generateQuestionsForCandidate(candidate, job);
      hrQuestions = qna.hrQuestions || [];
      technicalQuestions = qna.technicalQuestions || [];
    } catch (err) {
      console.error('LLM Q&A generation failed, using fallbacks:', err.message);
      hrQuestions = [
        { question: "Can you walk me through your background and key experiences?", answer: "A strong candidate should walk through their resume timeline, highlighting relevant projects and roles." },
        { question: "Why are you interested in this position and our organization?", answer: "The candidate should demonstrate knowledge of the company and align it with their career goals." },
        { question: "Describe a challenging workplace situation and how you resolved it.", answer: "The candidate should use the STAR method to describe a conflict or obstacle and a positive outcome." },
        { question: "What are your key professional strengths and areas for growth?", answer: "The candidate should list 2-3 genuine strengths and a growth area they are actively working on." },
        { question: "Where do you see yourself professionally in the next five years?", answer: "The candidate should show ambition, interest in growth, and connection to the industry/role." }
      ];
      technicalQuestions = [
        { question: "What is your primary programming language or technology stack, and why?", answer: "The candidate should explain their stack preferences and the trade-offs of their choices." },
        { question: "Explain a technical challenge you faced on a project and how you solved it.", answer: "The candidate should detail the technical problem, their architectural or code-level solution, and the result." },
        { question: "How do you ensure code quality, readability, and testability in your work?", answer: "The candidate should mention testing frameworks, code reviews, design patterns, and clean code practices." },
        { question: "What is your approach to optimizing performance or scalability in an application?", answer: "The candidate should discuss caching, database query optimization, load balancing, or profiling tools." },
        { question: "Describe how you keep up-to-date with new technologies and industry trends.", answer: "The candidate should mention blogs, newsletters, side projects, open source, or professional courses." }
      ];
    }

    const updatedCandidate = await Candidate.findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          hrQuestions,
          technicalQuestions
        },
        $push: {
          history: {
            date: new Date().toISOString(),
            type: 'QnAGenerated',
            text: 'Regenerated HR and Technical interview questions.'
          }
        }
      },
      { new: true }
    );
    res.json(updatedCandidate);
  } catch (error) {
    console.error('Failed to generate questions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  res.json(await Job.find());
});

app.post('/api/jobs', async (req, res) => {
  try {
    const { title, department, location, description, requirements, postings } = req.body;
    const newJob = new Job({ 
      id: `job-${Date.now()}`, 
      title, 
      department, 
      location, 
      description, 
      requirements,
      postings: postings || { linkedIn: false, indeed: false, zipRecruiter: false, internalCareer: false }
    });
    await newJob.save();
    res.json(newJob);
  } catch (error) {
    console.error('Failed to create job:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/generate', async (req, res) => {
  try {
    const { title, department, location, skills } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Job title is required.' });
    }
    const result = await generateJobDescription(title, department, location, skills);
    res.json(result);
  } catch (error) {
    console.error('Failed to generate job description:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/:id/postings', async (req, res) => {
  try {
    const { postings } = req.body;
    const job = await Job.findOneAndUpdate(
      { id: req.params.id },
      { $set: { postings } },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    console.error('Failed to update job postings:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  await Job.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

app.get('/api/settings', async (req, res) => {
  const settings = await Settings.findById('global');
  if (!settings) return res.json({});
  const safeSettings = settings.toObject();
  if (safeSettings.emailPassword) safeSettings.emailPassword = '••••••••';
  if (safeSettings.geminiApiKey) safeSettings.geminiApiKey = '••••••••';
  if (safeSettings.openaiApiKey) safeSettings.openaiApiKey = '••••••••';
  if (safeSettings.claudeApiKey) safeSettings.claudeApiKey = '••••••••';
  if (safeSettings.outlookClientSecret) safeSettings.outlookClientSecret = '••••••••';
  res.json(safeSettings);
});

app.post('/api/settings', async (req, res) => {
  const allowedSettingsKeys = [
    'tagPreferences', 'sourcingAgentActive', 'emailProvider', 'emailUser', 'emailPassword',
    'outlookClientId', 'outlookTenantId', 'outlookClientSecret', 'outlookUserEmail',
    'aiProvider', 'geminiApiKey', 'openaiApiKey', 'claudeApiKey', 'ollamaUrl', 'ollamaModel',
    'rankAccordingToJob'
  ];

  const updateData = {};
  for (const key of allowedSettingsKeys) {
    if (req.body[key] !== undefined) {
      updateData[key] = req.body[key];
    }
  }

  const settings = await Settings.findOneAndUpdate(
    { _id: 'global' }, 
    { $set: updateData }, 
    { new: true, upsert: true }
  );
  
  // Trigger background connection test immediately
  testConnectionInBackground().catch(err => console.error('Background connection test failed:', err));

  const safeSettings = settings.toObject();
  if (safeSettings.emailPassword) safeSettings.emailPassword = '••••••••';
  if (safeSettings.geminiApiKey) safeSettings.geminiApiKey = '••••••••';
  if (safeSettings.openaiApiKey) safeSettings.openaiApiKey = '••••••••';
  if (safeSettings.claudeApiKey) safeSettings.claudeApiKey = '••••••••';
  if (safeSettings.outlookClientSecret) safeSettings.outlookClientSecret = '••••••••';
  res.json(safeSettings);
});

app.get('/api/search/tags', (req, res) => res.json({ matches: searchIndex.searchTags(req.query.q) }));
app.get('/api/search/suggestions', (req, res) => res.json({ suggestions: searchIndex.getSuggestions(req.query.prefix || '') }));
app.get('/api/search/tag-cloud', (req, res) => res.json({ cloud: searchIndex.getTagCloud() }));

// ==================== RAG SEARCH ROUTES ====================

app.post('/api/rag/search', async (req, res) => {
  try {
    const { query, topK = 10, jobId = null } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    const results = await searchResumes(query.trim(), topK, jobId);
    res.json(results);
  } catch (error) {
    console.error('RAG search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rag/ask', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    const result = await ragAnswer(query.trim(), topK);
    res.json(result);
  } catch (error) {
    console.error('RAG ask error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rag/reindex', async (req, res) => {
  try {
    res.json({ message: 'Reindexing started in background.' });
    // Run in background after response is sent
    indexAllCandidates((current, total) => {
      if (current % 5 === 0 || current === total) console.log(`RAG reindex: ${current}/${total}`);
    }).then(result => {
      console.log(`RAG reindex complete: ${result.indexed} indexed, ${result.errors} errors.`);
    }).catch(err => console.error('RAG reindex failed:', err.message));
  } catch (error) {
    console.error('RAG reindex error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rag/status', async (req, res) => {
  try {
    const status = await getRAGStatus();
    res.json(status);
  } catch (error) {
    console.error('RAG status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/tag-preferences', async (req, res) => {
  const settings = await Settings.findById('global');
  res.json(settings?.tagPreferences || []);
});

app.post('/api/settings/tag-preferences', async (req, res) => {
  const settings = await Settings.findOneAndUpdate(
    { _id: 'global' }, 
    { $set: { tagPreferences: req.body.tagPreferences || [] } }, 
    { new: true, upsert: true }
  );
  res.json(settings.tagPreferences);
});

// Gmail connection test
app.post('/api/gmail/test-connection', async (req, res) => {
  try {
    const emailConfig = await getEmailConfig();
    const user = emailConfig.user;
    const pass = emailConfig.pass;

    if (!user || !pass) {
      return res.status(400).json({ success: false, error: 'Gmail credentials are not configured.' });
    }

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false
    });

    await client.connect();
    
    const lock = await client.getMailboxLock('INBOX');
    let totalItems = 0;
    let unreadItems = 0;
    try {
      const status = await client.status('INBOX', { messages: true });
      totalItems = status.messages || 0;
      const unseenUids = await client.search({ unseen: true });
      unreadItems = unseenUids.length || 0;
    } finally {
      lock.release();
    }
    
    await client.logout();

    lastGmailConnectionStatus = { success: true, error: null, lastChecked: new Date() };
    res.json({
      success: true,
      message: 'Connection test passed! Gmail IMAP server is fully accessible.',
      mailbox: {
        displayName: 'INBOX',
        totalItems: totalItems,
        unreadItems: unreadItems
      }
    });
  } catch (error) {
    console.error('Gmail connection test failed:', error.message);
    const errMsg = error.responseText ? `${error.message}: ${error.responseText}` : error.message;
    lastGmailConnectionStatus = { success: false, error: errMsg, lastChecked: new Date() };
    res.status(500).json({ success: false, error: errMsg });
  }
});

// Outlook connection test
app.post('/api/outlook/test-connection', async (req, res) => {
  try {
    const settings = await Settings.findById('global');
    const clientId = settings?.outlookClientId || process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = settings?.outlookClientSecret || process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = settings?.outlookTenantId || process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID;
    const userEmail = settings?.outlookUserEmail || process.env.OUTLOOK_USER_EMAIL || '';

    if (!clientId || !clientSecret || !tenantId) {
      return res.status(400).json({ success: false, error: 'Outlook credentials are not fully configured.' });
    }

    // Force fresh token
    invalidateTokenCache();
    const accessToken = await getOutlookAccessToken(true);

    if (!userEmail) {
      return res.json({ success: true, message: 'Authentication successful! Token acquired. Configure a mailbox email to start reading emails.' });
    }

    // Try to access the user's mailbox
    const testUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount`;
    const testResponse = await fetch(testUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!testResponse.ok) {
      const errText = await testResponse.text();
      return res.status(400).json({ success: false, error: `Token OK, but mailbox access failed: ${testResponse.status} - ${errText}` });
    }

    const testData = await testResponse.json();
    lastOutlookConnectionStatus = { success: true, error: null, lastChecked: new Date() };
    res.json({
      success: true,
      message: 'Connection test passed! Outlook mailbox is fully accessible.',
      mailbox: {
        displayName: testData.displayName || 'Inbox',
        totalItems: testData.totalItemCount || 0,
        unreadItems: testData.unreadItemCount || 0
      }
    });
  } catch (error) {
    console.error('Outlook connection test failed:', error.message);
    lastOutlookConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
    res.status(500).json({ success: false, error: error.message });
  }
});

// Email logs endpoint
app.get('/api/email-logs', async (req, res) => {
  try {
    const logs = await EmailLog.find().sort({ timestamp: -1 }).limit(100);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pre-register Ingestion Logs for batch upload
app.post('/api/ingestion-logs/pre-register', async (req, res) => {
  try {
    const { files } = req.body; // Array of { fileName, source }
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'files array is required' });
    }

    const registeredLogs = [];
    for (const f of files) {
      const logId = `ingestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newLog = new IngestionLog({
        id: logId,
        fileName: f.fileName,
        source: f.source || 'manual',
        status: 'processing'
      });
      await newLog.save();
      registeredLogs.push({ id: logId, fileName: f.fileName });
    }

    res.json({ logs: registeredLogs });
  } catch (error) {
    console.error('Failed to pre-register ingestion logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ingestion logs endpoint
app.get('/api/ingestion-logs', async (req, res) => {
  try {
    const logs = await IngestionLog.find().sort({ timestamp: -1 }).limit(200);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(` TalentFlow server running at http://localhost:${PORT}`);
  console.log(` MongoDB Connected & Ready.`);
  console.log(`=================================================\n`);
});

// Set server timeouts to 10 minutes (600,000 ms) for slow local LLMs
server.timeout = 600000;
server.headersTimeout = 601000;
server.requestTimeout = 600000;
server.keepAliveTimeout = 600000;

