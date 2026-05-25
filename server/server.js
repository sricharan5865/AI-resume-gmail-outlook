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
import { parseResume, scoreCandidate, scoreCandidateByOwnCategory, generateTags } from './geminiParser.js';
import { extractTextFromPDF } from './parser.js';
import { searchIndex } from './searchIndex.js';
import { Candidate, Job, Settings, ProcessedEmail } from './models.js';
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

async function getEmailConfig() {
  const settings = await Settings.findById('global');
  if (settings) {
    return {
      provider: settings.emailProvider ?? 'gmail',
      user: settings.emailUser ?? '',
      pass: settings.emailPassword ?? '',
      sourcingAgentActive: settings.sourcingAgentActive !== false,
      outlookClientId: settings.outlookClientId ?? '',
      outlookClientSecret: settings.outlookClientSecret ?? '',
      outlookTenantId: settings.outlookTenantId ?? '',
      outlookUserEmail: settings.outlookUserEmail ?? ''
    };
  }
  return {
    provider: 'gmail',
    user: process.env.GMAIL_USER_EMAIL || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
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
      lastGmailConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
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
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF resumes are supported.'));
  }
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

  try {
    // Save PDF locally
    const localFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const localFilePath = path.join(UPLOADS_DIR, localFilename);
    fs.writeFileSync(localFilePath, buffer);

    console.log(`Extracting text from ${filename}...`);
    const pdfText = await extractTextFromPDF(buffer);

    console.log('Parsing resume with Gemini...');
    const parsedData = await parseResume(pdfText);

    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      duplicate = await Candidate.findOne({ email: parsedData.email });
    } else if (parsedData.name) {
      duplicate = await Candidate.findOne({ name: parsedData.name });
    }

    if (duplicate) {
      console.log(`Candidate with email ${parsedData.email || 'N/A'} (name: ${parsedData.name}) already exists. Skipping import.`);
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
      id: `candidate-${Date.now()}`,
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
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
    });

    await newCandidate.save();

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

    console.log(`Successfully imported: ${newCandidate.name}`);
    return newCandidate;
  } catch (error) {
    console.error(`Failed to process attachment ${filename}:`, error);
  }
}

async function runEmailPoller() {
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
        lastGmailConnectionStatus = { success: false, error: gmailErr.message, lastChecked: new Date() };
        await EmailLog.create({ level: 'error', source: 'poller', message: gmailErr.message }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Automated Poller Error:', err.message);
    try { await EmailLog.create({ level: 'error', source: 'poller', message: err.message }); } catch(e) {}
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
    lastGmailConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
    res.status(500).json({ error: error.message });
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

  try {
    const localFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const localFilePath = path.join(UPLOADS_DIR, localFilename);
    fs.writeFileSync(localFilePath, buffer);
    const pdfText = await extractTextFromPDF(buffer);
    const parsedData = await parseResume(pdfText);

    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      duplicate = await Candidate.findOne({ email: parsedData.email });
    } else if (parsedData.name) {
      duplicate = await Candidate.findOne({ name: parsedData.name });
    }

    if (duplicate) {
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
      id: `candidate-${Date.now()}`, jobId, name: parsedData.name || 'Unknown',
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
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
    });

    await newCandidate.save();
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

    res.json(newCandidate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/candidates/upload', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded.' });
  const { jobId } = req.body;

  try {
    const buffer = fs.readFileSync(req.file.path);
    const pdfText = await extractTextFromPDF(buffer);
    const parsedData = await parseResume(pdfText);
    
    // Duplicate Check
    let duplicate = null;
    if (parsedData.email) {
      duplicate = await Candidate.findOne({ email: parsedData.email });
    } else if (parsedData.name) {
      duplicate = await Candidate.findOne({ name: parsedData.name });
    }

    if (duplicate) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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

    let generatedTags = await generateTags(parsedData, job || { title: 'General', description: '' }, settings?.tagPreferences || []);

    const newCandidate = new Candidate({
      id: `candidate-${Date.now()}`, jobId, name: parsedData.name || 'Unknown',
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
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
    });

    await newCandidate.save();
    searchIndex.buildIndex(await Candidate.find());
    res.json(newCandidate);
  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
  const { stage } = req.body;
  const candidate = await Candidate.findOne({ id: req.params.id });
  if (!candidate) return res.status(404).json({ error: 'Not found.' });

  const oldStage = candidate.stage;
  candidate.stage = stage;
  candidate.history.push({ date: new Date().toISOString(), type: 'StageChanged', text: `Moved from "${oldStage}" to "${stage}"` });
  
  await candidate.save();
  res.json(candidate);
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

app.get('/api/jobs', async (req, res) => {
  res.json(await Job.find());
});

app.post('/api/jobs', async (req, res) => {
  const { title, department, location, description, requirements } = req.body;
  const newJob = new Job({ id: `job-${Date.now()}`, title, department, location, description, requirements });
  await newJob.save();
  res.json(newJob);
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
  const settings = await Settings.findOneAndUpdate(
    { _id: 'global' }, 
    { $set: req.body }, 
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
    lastGmailConnectionStatus = { success: false, error: error.message, lastChecked: new Date() };
    res.status(500).json({ success: false, error: error.message });
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

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(` TalentFlow server running at http://localhost:${PORT}`);
  console.log(` MongoDB Connected & Ready.`);
  console.log(`=================================================\n`);
});
