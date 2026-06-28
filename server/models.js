import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  jobId: { type: String }, // null/empty means 'General Role'
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  linkedinUrl: { type: String },
  skills: [String],
  experience: [
    {
      role: String,
      company: String,
      duration: String,
      description: String
    }
  ],
  education: [
    {
      degree: String,
      institution: String,
      year: String
    }
  ],
  tags: [
    {
      value: String,
      category: String,
      confidence: Number
    }
  ],
  stage: { type: String, default: 'Inbox' },
  resumeUrl: { type: String },
  resumeText: { type: String, default: '' },
  matchScore: { type: Number, default: 0 },
  matchingSkills: [String],
  missingSkills: [String],
  matchExplanation: { type: String },
  ownCategoryScore: { type: Number, default: 0 },
  ownCategoryMatchingSkills: [String],
  ownCategoryMissingSkills: [String],
  ownCategoryExplanation: { type: String },
  comments: { type: String },
  seniorityLevel: { type: String, default: 'Mid' },
  interviewQuestions: [String],
  hrQuestions: [
    {
      question: String,
      answer: String
    }
  ],
  technicalQuestions: [
    {
      question: String,
      answer: String
    }
  ],
  createdAt: { type: Date, default: Date.now },
  history: [
    {
      date: String,
      type: { type: String },
      text: String
    }
  ]
});

const jobSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  department: { type: String, default: 'Engineering' },
  location: { type: String, default: 'Remote' },
  status: { type: String, default: 'Active' },
  description: { type: String },
  requirements: { type: String },
  postings: {
    linkedIn: { type: Boolean, default: false },
    indeed: { type: Boolean, default: false },
    zipRecruiter: { type: Boolean, default: false },
    internalCareer: { type: Boolean, default: false }
  }
});

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' }, // Singleton
  tagPreferences: [
    {
      category: String,
      description: String
    }
  ],
  sourcingAgentActive: { type: Boolean, default: true },
  emailProvider: { type: String, default: 'gmail' }, // 'gmail'
  emailUser: { type: String, default: '' },
  emailPassword: { type: String, default: '' },
  outlookClientId: { type: String, default: '' },
  outlookTenantId: { type: String, default: '' },
  outlookClientSecret: { type: String, default: '' },
  outlookUserEmail: { type: String, default: '' },
  aiProvider: { type: String, default: 'gemini' }, // 'gemini', 'openai', 'claude', 'ollama'
  geminiApiKey: { type: String, default: '' },
  openaiApiKey: { type: String, default: '' },
  claudeApiKey: { type: String, default: '' },
  ollamaUrl: { type: String, default: 'http://localhost:11434' },
  ollamaModel: { type: String, default: 'llama3' },
  rankAccordingToJob: { type: Boolean, default: true }
});

// Deduplication collection
const processedEmailSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  processedAt: { type: Date, default: Date.now }
});

const emailLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  source: { type: String, required: true }, // e.g., 'outlook-auth', 'outlook-poll', 'email-categorize', 'imap-poll'
  message: { type: String, required: true },
  details: { type: String, default: '' },
  emailId: { type: String, default: '' }
});

const ingestionLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  source: { type: String, enum: ['manual', 'gmail', 'outlook'], default: 'manual' },
  status: { type: String, enum: ['processing', 'success', 'failed', 'duplicate', 'cancelled'], default: 'processing' },
  error: { type: String, default: '' },
  candidateId: { type: String, default: '' },
  candidateName: { type: String, default: '' },
  extractedData: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now }
});

const resumeChunkSchema = new mongoose.Schema({
  chunkId: { type: String, required: true, unique: true },
  candidateId: { type: String, required: true, index: true },
  section: { type: String, required: true, enum: ['contact', 'skills', 'experience', 'education', 'summary', 'tags'] },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  metadata: {
    name: String,
    company: String,
    role: String,
    seniority: String
  }
}, { timestamps: true });

resumeChunkSchema.index({ candidateId: 1, section: 1 });

export const Candidate = mongoose.model('Candidate', candidateSchema);
export const Job = mongoose.model('Job', jobSchema);
export const Settings = mongoose.model('Settings', settingsSchema);
export const ProcessedEmail = mongoose.model('ProcessedEmail', processedEmailSchema);
export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
export const IngestionLog = mongoose.model('IngestionLog', ingestionLogSchema);
export const ResumeChunk = mongoose.model('ResumeChunk', resumeChunkSchema);

