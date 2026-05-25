import { useState, useEffect } from 'react';
import { Shield, Briefcase, Mail, Plus, Trash2, Info, AlertTriangle, Tag } from 'lucide-react';

export default function SettingsView({ jobs, templates, onJobCreated, onJobDeleted, onTemplatesUpdated, onSettingsSaved, backendUrl }) {
  const [activeSubTab, setActiveSubTab] = useState('jobs');

  // New Job Form State
  const [jobTitle, setJobTitle] = useState('');
  const [jobDept, setJobDept] = useState('');
  const [jobLoc, setJobLoc] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [jobReqs, setJobReqs] = useState('');

  // Email Template Form State
  const [tplInterview, setTplInterview] = useState('');
  const [tplOffer, setTplOffer] = useState('');
  const [tplReject, setTplReject] = useState('');

  // Tag Preferences State
  const [tagPreferences, setTagPreferences] = useState([]);

  // Sourcing and AI settings state
  const [sourcingAgentActive, setSourcingAgentActive] = useState(true);
  const [emailProvider, setEmailProvider] = useState('gmail');
  const [emailUser, setEmailUser] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [aiProvider, setAiProvider] = useState('gemini');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [savingSettings, setSavingSettings] = useState(false);

  // API configuration present status
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [claudeConfigured, setClaudeConfigured] = useState(false);

  // Outlook configuration state
  const [outlookClientId, setOutlookClientId] = useState('');
  const [outlookClientSecret, setOutlookClientSecret] = useState('');
  const [outlookTenantId, setOutlookTenantId] = useState('');
  const [outlookUserEmail, setOutlookUserEmail] = useState('');
  const [outlookTestResult, setOutlookTestResult] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState(null);
  const [testingGmailConnection, setTestingGmailConnection] = useState(false);
  const [outlookConfigured, setOutlookConfigured] = useState(false);
  const [imapConfigured, setImapConfigured] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [imapConnected, setImapConnected] = useState(false);
  const [outlookConnectionError, setOutlookConnectionError] = useState(null);
  const [imapConnectionError, setImapConnectionError] = useState(null);

  useEffect(() => {
    checkAuthStatus();
    fetchTagPreferences();
    fetchSourcingAndAISettings();
  }, [activeSubTab]);

  useEffect(() => {
    if (templates) {
      setTplInterview(templates.interview || '');
      setTplOffer(templates.offer || '');
      setTplReject(templates.reject || '');
    }
  }, [templates]);

  const fetchTagPreferences = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/settings/tag-preferences`);
      const data = await res.json();
      setTagPreferences(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSourcingAndAISettings = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setSourcingAgentActive(data.sourcingAgentActive !== false);
          setEmailProvider(data.emailProvider || 'gmail');
          setEmailUser(data.emailUser || '');
          setEmailPassword(data.emailPassword ? '••••••••' : '');
          setAiProvider(data.aiProvider || 'gemini');
          setGeminiApiKey(data.geminiApiKey ? '••••••••' : '');
          setOpenaiApiKey(data.openaiApiKey ? '••••••••' : '');
          setClaudeApiKey(data.claudeApiKey ? '••••••••' : '');
          setOllamaUrl(data.ollamaUrl || 'http://localhost:11434');
          setOllamaModel(data.ollamaModel || 'llama3');
          setOutlookClientId(data.outlookClientId ? '••••••••' : '');
          setOutlookClientSecret(data.outlookClientSecret ? '••••••••' : '');
          setOutlookTenantId(data.outlookTenantId || '');
          setOutlookUserEmail(data.outlookUserEmail || '');
        }
      }
    } catch (e) {
      console.error('Failed to load sourcing and AI settings:', e);
    }
  };

  const checkAuthStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/status`);
      const data = await res.json();
      setGeminiConfigured(!!data.geminiApiKeyConfigured);
      setOpenaiConfigured(!!data.openaiApiKeyConfigured);
      setClaudeConfigured(!!data.claudeApiKeyConfigured);
      setOutlookConfigured(!!data.outlookConfigured);
      setImapConfigured(!!data.imapConfigured);
      setOutlookConnected(!!data.outlookConnected);
      setImapConnected(!!data.imapConnected);
      setOutlookConnectionError(data.outlookConnectionError || null);
      setImapConnectionError(data.imapConnectionError || null);
    } catch (e) {
      console.error(e);
    }
  };

  // Google disconnect handler removed

  // Job actions
  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!jobTitle || !jobDesc || !jobReqs) {
      alert('Please fill out Title, Description, and Requirements.');
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: jobTitle,
          department: jobDept,
          location: jobLoc,
          description: jobDesc,
          requirements: jobReqs
        })
      });

      if (!res.ok) throw new Error('Failed to create job');
      const newJob = await res.json();
      onJobCreated(newJob);
      
      // Reset form
      setJobTitle('');
      setJobDept('');
      setJobLoc('');
      setJobDesc('');
      setJobReqs('');
      alert('Job posting created successfully!');
    } catch (e) {
      console.error(e);
      alert('Error creating job posting.');
    }
  };

  const handleDeleteJob = async (id) => {
    if (!window.confirm('Are you sure you want to delete this job posting? Candidates will remain in database but won\'t have job associations.')) return;
    if (!window.confirm('Are you absolutely sure you want to delete this job posting? This cannot be undone.')) return;
    try {
      await fetch(`${backendUrl}/api/jobs/${id}`, { method: 'DELETE' });
      onJobDeleted(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Template actions
  const handleSaveTemplates = async (e) => {
    e.preventDefault();
    try {
      const newTpls = {
        interview: tplInterview,
        offer: tplOffer,
        reject: tplReject
      };

      const res = await fetch(`${backendUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailTemplates: newTpls })
      });

      if (!res.ok) throw new Error('Failed to update templates');
      onTemplatesUpdated(newTpls);
      alert('Templates updated successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save templates.');
    }
  };

  // Tag Preferences actions
  const handleSaveTagPreferences = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${backendUrl}/api/settings/tag-preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagPreferences })
      });
      if (!res.ok) throw new Error('Failed to update tag preferences');
      alert('Tag categories updated successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save tag categories.');
    }
  };

  const handleSaveSourcingAndAISettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updateData = {
        sourcingAgentActive,
        emailProvider,
        emailUser
      };

      if (emailPassword !== '••••••••') {
        updateData.emailPassword = emailPassword;
      }
      if (geminiApiKey !== '••••••••') {
        updateData.geminiApiKey = geminiApiKey;
      }
      if (openaiApiKey !== '••••••••') {
        updateData.openaiApiKey = openaiApiKey;
      }
      if (claudeApiKey !== '••••••••') {
        updateData.claudeApiKey = claudeApiKey;
      }
      updateData.aiProvider = aiProvider;
      updateData.ollamaUrl = ollamaUrl;
      updateData.ollamaModel = ollamaModel;
      if (outlookClientId !== '••••••••') {
        updateData.outlookClientId = outlookClientId;
      }
      if (outlookClientSecret !== '••••••••') {
        updateData.outlookClientSecret = outlookClientSecret;
      }
      updateData.outlookTenantId = outlookTenantId;
      updateData.outlookUserEmail = outlookUserEmail;

      const res = await fetch(`${backendUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!res.ok) throw new Error('Failed to save settings');
      alert('Sourcing & AI Agent settings saved successfully!');
      checkAuthStatus();
      if (onSettingsSaved) onSettingsSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to save settings: ' + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestOutlookConnection = async () => {
    setTestingConnection(true);
    setOutlookTestResult(null);
    try {
      const res = await fetch(`${backendUrl}/api/outlook/test-connection`, { method: 'POST' });
      const data = await res.json();
      setOutlookTestResult(data);
      if (data.success) {
        checkAuthStatus();
      }
    } catch (e) {
      setOutlookTestResult({ success: false, error: e.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestGmailConnection = async () => {
    setTestingGmailConnection(true);
    setGmailTestResult(null);
    try {
      const res = await fetch(`${backendUrl}/api/gmail/test-connection`, { method: 'POST' });
      const data = await res.json();
      setGmailTestResult(data);
      if (data.success) {
        checkAuthStatus();
      }
    } catch (e) {
      setGmailTestResult({ success: false, error: e.message });
    } finally {
      setTestingGmailConnection(false);
    }
  };

  const handleAddTagCategory = () => {
    setTagPreferences([...tagPreferences, { category: '', description: '', values: [] }]);
  };

  const handleRemoveTagCategory = (index) => {
    setTagPreferences(tagPreferences.filter((_, i) => i !== index));
  };

  const handleUpdateTagCategory = (index, field, value) => {
    const updated = [...tagPreferences];
    if (field === 'values') {
      updated[index][field] = value.split(',').map(v => v.trim()).filter(v => v);
    } else {
      updated[index][field] = value;
    }
    setTagPreferences(updated);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '32px', height: '100%' }}>
      
      {/* Sidebar for settings views */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          className="btn" 
          style={{ 
            justifyContent: 'flex-start', 
            background: activeSubTab === 'jobs' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'jobs' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setActiveSubTab('jobs')}
        >
          <Briefcase size={16} /> Job Positions
        </button>
        <button 
          className="btn" 
          style={{ 
            justifyContent: 'flex-start', 
            background: activeSubTab === 'templates' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'templates' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setActiveSubTab('templates')}
        >
          <Mail size={16} /> Email Templates
        </button>
        <button 
          className="btn" 
          style={{ 
            justifyContent: 'flex-start', 
            background: activeSubTab === 'tags' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'tags' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setActiveSubTab('tags')}
        >
          <Tag size={16} /> AI Tagging
        </button>
        <button 
          className="btn" 
          style={{ 
            justifyContent: 'flex-start', 
            background: activeSubTab === 'credentials' ? 'var(--accent-gradient)' : 'transparent',
            color: activeSubTab === 'credentials' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setActiveSubTab('credentials')}
        >
          <Shield size={16} /> API Integration
        </button>
      </div>

      {/* Main Settings Display */}
      <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)', overflowY: 'auto' }}>
        
        {/* VIEW 1: JOBS MANAGEMENT */}
        {activeSubTab === 'jobs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Job Postings</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Manage the job descriptions used by the Google Gemini AI engine to calculate candidate match scores.
              </p>
            </div>

            {/* List active jobs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Active Positions ({jobs.length})</h4>
              {jobs.length === 0 ? (
                <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No active job postings. Create one below to begin matching.
                </div>
              ) : (
                jobs.map(job => (
                  <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '600' }}>{job.title}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{job.department} • {job.location}</p>
                    </div>
                    <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDeleteJob(job.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Job Form */}
            <form onSubmit={handleCreateJob} style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '15px' }}>Add New Position</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Job Title*</label>
                  <input type="text" className="form-input" placeholder="e.g. Node Backend Engineer" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input type="text" className="form-input" placeholder="e.g. Engineering" value={jobDept} onChange={(e) => setJobDept(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input type="text" className="form-input" placeholder="e.g. Remote / Hyderabad" value={jobLoc} onChange={(e) => setJobLoc(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Job Description Summary*</label>
                <textarea className="form-input" rows={3} placeholder="Describe the role responsibilities..." value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Requirements Criteria* (One per line or comma-separated)</label>
                <textarea className="form-input" rows={4} placeholder="e.g. React.js, Node.js, 3+ years of experience, Docker, AWS..." value={jobReqs} onChange={(e) => setJobReqs(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                <Plus size={14} /> Add Position
              </button>
            </form>
          </div>
        )}

        {/* VIEW 2: TEMPLATE SETTINGS */}
        {activeSubTab === 'templates' && (
          <form onSubmit={handleSaveTemplates} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Email Templates</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Edit letters sent to candidates. You can use standard formatting. Placeholders will automatically resolve.
              </p>
            </div>

            <div className="glass" style={{ padding: '12px 16px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                <strong>Dynamic Placeholders:</strong> Use <code>{`{candidate_name}`}</code> for candidate's full name, <code>{`{job_title}`}</code> for their assigned job position, and <code>{`{company_name}`}</code> for your company name.
                <br />
                The first line starting with <code>Subject:</code> will be parsed as the email subject line.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Interview Invitation Template</label>
              <textarea className="form-input" rows={6} value={tplInterview} onChange={(e) => setTplInterview(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '13px' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Offer Letter Template</label>
              <textarea className="form-input" rows={6} value={tplOffer} onChange={(e) => setTplOffer(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '13px' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Rejection Letter Template</label>
              <textarea className="form-input" rows={6} value={tplReject} onChange={(e) => setTplReject(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '13px' }} />
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Save Templates
            </button>
          </form>
        )}

        {/* VIEW 2B: AI TAGGING PREFERENCES */}
        {activeSubTab === 'tags' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>AI Tagging Categories</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Define the categories that the AI will use to automatically classify candidates during resume extraction.
              </p>
            </div>

            <form onSubmit={handleSaveTagPreferences} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {tagPreferences.map((pref, index) => (
                <div key={index} className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-md)', position: 'relative' }}>
                  <button 
                    type="button"
                    className="btn btn-danger" 
                    style={{ position: 'absolute', top: '16px', right: '16px', padding: '6px' }}
                    onClick={() => handleRemoveTagCategory(index)}
                  >
                    <Trash2 size={14} />
                  </button>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '85%' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Category Name</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Seniority Level" 
                        value={pref.category} 
                        onChange={(e) => handleUpdateTagCategory(index, 'category', e.target.value)} 
                        required 
                      />
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">AI Description (Prompt context)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Level of professional experience" 
                        value={pref.description} 
                        onChange={(e) => handleUpdateTagCategory(index, 'description', e.target.value)} 
                        required 
                      />
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Allowed Values (Comma separated, or leave blank for AI to infer freely)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Junior, Mid-Level, Senior" 
                        value={pref.values?.join(', ') || ''} 
                        onChange={(e) => handleUpdateTagCategory(index, 'values', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={handleAddTagCategory}>
                  <Plus size={14} /> Add Category
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Tag Preferences
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 3: CREDENTIALS SETUP INFO */}
        {activeSubTab === 'credentials' && (
          <form onSubmit={handleSaveSourcingAndAISettings} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>AI Sourcing & Channels Integration</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Toggle automated sourcing agents and configure external channels (Gmail) and AI engines (Gemini, Claude, OpenAI).
              </p>
            </div>

            {/* Sourcing Agent Status Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Automated Sourcing Agent</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Checks the chosen email inbox automatically every 30 seconds for new PDF resumes.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', width: '180px' }}>
                <button type="button" onClick={() => setSourcingAgentActive(true)} style={{ flex: 1, padding: '6px 12px', borderRadius: '6px', border: 'none', background: sourcingAgentActive ? 'var(--status-offered)' : 'transparent', color: sourcingAgentActive ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', fontSize: '12px', transition: 'all 0.2s' }}>Active</button>
                <button type="button" onClick={() => setSourcingAgentActive(false)} style={{ flex: 1, padding: '6px 12px', borderRadius: '6px', border: 'none', background: !sourcingAgentActive ? 'rgba(244, 63, 94, 0.2)' : 'transparent', color: !sourcingAgentActive ? 'var(--status-rejected)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', fontSize: '12px', transition: 'all 0.2s' }}>Inactive</button>
              </div>
            </div>

            {/* Email Provider Sourcing Section */}
            <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Email Sourcing Channel
                  {((emailProvider === 'gmail' && imapConnected) || (emailProvider === 'outlook' && outlookConnected)) ? (
                    <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span> Connected
                    </span>
                  ) : ((emailProvider === 'gmail' ? imapConnectionError : outlookConnectionError) ? (
                    <span style={{ fontSize: '11px', background: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f43f5e' }}></span> Connection Error
                    </span>
                  ) : ((emailProvider === 'gmail' ? imapConfigured : outlookConfigured) ? (
                    <span style={{ fontSize: '11px', background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }}></span> Configured
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600', border: '1px solid var(--glass-border)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)' }}></span> Not Configured
                    </span>
                  )))}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: '700', textTransform: 'uppercase' }}>Channel Config</span>
              </div>

              {/* Provider Selector */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                <button type="button" onClick={() => setEmailProvider('gmail')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: emailProvider === 'gmail' ? 'var(--accent-gradient)' : 'transparent', color: emailProvider === 'gmail' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Mail size={14} /> Gmail (IMAP)
                  {imapConnected && (
                    <span style={{ fontSize: '10px', background: emailProvider === 'gmail' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(34, 197, 94, 0.15)', color: emailProvider === 'gmail' ? 'white' : '#22c55e', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Connected
                    </span>
                  )}
                  {!imapConnected && imapConnectionError && (
                    <span style={{ fontSize: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Error
                    </span>
                  )}
                  {!imapConnected && !imapConnectionError && imapConfigured && (
                    <span style={{ fontSize: '10px', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Configured
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => setEmailProvider('outlook')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: emailProvider === 'outlook' ? 'linear-gradient(135deg, #0078d4, #106ebe)' : 'transparent', color: emailProvider === 'outlook' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Shield size={14} /> Outlook (Office 365)
                  {outlookConnected && (
                    <span style={{ fontSize: '10px', background: emailProvider === 'outlook' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(34, 197, 94, 0.15)', color: emailProvider === 'outlook' ? 'white' : '#22c55e', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Connected
                    </span>
                  )}
                  {!outlookConnected && outlookConnectionError && (
                    <span style={{ fontSize: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Error
                    </span>
                  )}
                  {!outlookConnected && !outlookConnectionError && outlookConfigured && (
                    <span style={{ fontSize: '10px', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: '600' }}>
                      Configured
                    </span>
                  )}
                </button>
              </div>

              {/* Gmail Config */}
              {emailProvider === 'gmail' && (
                <>
                  {imapConnectionError && (
                    <div className="glass" style={{
                      padding: '16px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: '8px',
                      border: '1px solid rgba(244, 63, 94, 0.2)', display: 'flex', gap: '12px',
                      color: '#f43f5e', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px'
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Gmail IMAP Connection Error</strong>
                        {imapConnectionError}
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Please check that your App Password is correct, and IMAP is enabled in your Gmail settings.
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Sourcing Email Address</label>
                      <input type="email" className="form-input" placeholder="recruitment@company.com" value={emailUser} onChange={(e) => setEmailUser(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">App Password / Auth Key</label>
                      <input type="password" className="form-input" placeholder="Enter App Password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                    </div>
                  </div>
                  
                  {/* Test Connection Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={handleTestGmailConnection}
                      disabled={testingGmailConnection}
                      style={{
                        padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.4)',
                        background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', cursor: testingGmailConnection ? 'wait' : 'pointer',
                        fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.2s', opacity: testingGmailConnection ? 0.7 : 1
                      }}
                    >
                      {testingGmailConnection ? '⏳ Testing...' : '🔌 Test Connection'}
                    </button>

                    {gmailTestResult && (
                      <div style={{
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                        background: gmailTestResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        color: gmailTestResult.success ? '#22c55e' : '#f43f5e',
                        border: `1px solid ${gmailTestResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        {gmailTestResult.success ? '✓' : '✕'} {gmailTestResult.message || gmailTestResult.error}
                      </div>
                    )}
                  </div>

                  {/* Mailbox info if test succeeded */}
                  {gmailTestResult?.success && gmailTestResult?.mailbox && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
                      padding: '14px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '8px',
                      border: '1px solid rgba(99, 102, 241, 0.15)'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-primary)' }}>{gmailTestResult.mailbox.displayName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Folder Name</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{gmailTestResult.mailbox.totalItems}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Emails</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{gmailTestResult.mailbox.unreadItems}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unread</div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                    <strong>Tip:</strong> Sourcing requires an <strong>App Password</strong> rather than your standard login password due to security protocols. For Gmail, go to Google Account Security &rarr; App Passwords.
                  </div>
                </>
              )}

              {/* Outlook Config */}
              {emailProvider === 'outlook' && (
                <>
                  {outlookConnectionError && (
                    <div className="glass" style={{
                      padding: '16px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: '8px',
                      border: '1px solid rgba(244, 63, 94, 0.2)', display: 'flex', gap: '12px',
                      color: '#f43f5e', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px'
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Outlook Connection Error</strong>
                        {outlookConnectionError}
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          The backend polling agent failed to authenticate with Microsoft. Please check that the Azure App Registration still exists, client secret is not expired, and all API permissions (Mail.Read, Mail.ReadWrite, User.Read.All) are granted.
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Application (Client) ID</label>
                      <input type="text" className="form-input" placeholder="71fd45ef-6515-444e-a167-..." value={outlookClientId} onChange={(e) => setOutlookClientId(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Client Secret Value</label>
                      <input type="password" className="form-input" placeholder="Enter Client Secret" value={outlookClientSecret} onChange={(e) => setOutlookClientSecret(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Directory (Tenant) ID</label>
                      <input type="text" className="form-input" placeholder="e68ed096-47c9-4775-..." value={outlookTenantId} onChange={(e) => setOutlookTenantId(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Mailbox Email Address</label>
                      <input type="email" className="form-input" placeholder="hr@yourcompany.com" value={outlookUserEmail} onChange={(e) => setOutlookUserEmail(e.target.value)} />
                    </div>
                  </div>

                  {/* Test Connection Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={handleTestOutlookConnection}
                      disabled={testingConnection}
                      style={{
                        padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(0, 120, 212, 0.4)',
                        background: 'rgba(0, 120, 212, 0.1)', color: '#0078d4', cursor: testingConnection ? 'wait' : 'pointer',
                        fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.2s', opacity: testingConnection ? 0.7 : 1
                      }}
                    >
                      {testingConnection ? '⏳ Testing...' : '🔌 Test Connection'}
                    </button>

                    {outlookTestResult && (
                      <div style={{
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                        background: outlookTestResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        color: outlookTestResult.success ? '#22c55e' : '#f43f5e',
                        border: `1px solid ${outlookTestResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        {outlookTestResult.success ? '✓' : '✕'} {outlookTestResult.message || outlookTestResult.error}
                      </div>
                    )}
                  </div>

                  {/* Mailbox info if test succeeded */}
                  {outlookTestResult?.success && outlookTestResult?.mailbox && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
                      padding: '14px', background: 'rgba(0, 120, 212, 0.05)', borderRadius: '8px',
                      border: '1px solid rgba(0, 120, 212, 0.15)'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#0078d4' }}>{outlookTestResult.mailbox.displayName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Folder Name</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{outlookTestResult.mailbox.totalItems}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Emails</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{outlookTestResult.mailbox.unreadItems}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unread</div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                    <strong>Setup:</strong> Register an Azure AD application at <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{ color: '#0078d4', textDecoration: 'underline' }}>Azure Portal</a> &rarr; App Registrations. Grant <strong>Mail.Read</strong>, <strong>Mail.ReadWrite</strong>, and <strong>User.Read.All</strong> application permissions, then create a Client Secret.
                  </div>
                </>
              )}
            </div>

            {/* AI Parsing Agent Section */}
            <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>AI Processing Agent</h4>
                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: '700', textTransform: 'uppercase' }}>LLM Core</span>
              </div>

              {/* Selector buttons */}
              <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                <button type="button" onClick={() => setAiProvider('gemini')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: aiProvider === 'gemini' ? 'var(--accent-gradient)' : 'transparent', color: aiProvider === 'gemini' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px' }}>Gemini</button>
                <button type="button" onClick={() => setAiProvider('claude')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: aiProvider === 'claude' ? 'var(--accent-gradient)' : 'transparent', color: aiProvider === 'claude' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px' }}>Claude</button>
                <button type="button" onClick={() => setAiProvider('openai')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: aiProvider === 'openai' ? 'var(--accent-gradient)' : 'transparent', color: aiProvider === 'openai' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px' }}>OpenAI</button>
                <button type="button" onClick={() => setAiProvider('ollama')} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: aiProvider === 'ollama' ? 'var(--accent-gradient)' : 'transparent', color: aiProvider === 'ollama' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', fontSize: '13px' }}>Ollama</button>
              </div>

              {/* API Key Input fields depending on selector */}
              {aiProvider === 'gemini' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Google Gemini API Key</label>
                    {geminiConfigured && (
                      <span style={{ color: 'var(--status-offered)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ API Key Present
                      </span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder={geminiConfigured ? "•••••••• (Configured in Backend)" : "AIzaSy..."} 
                    value={geminiApiKey} 
                    onChange={(e) => setGeminiApiKey(e.target.value)} 
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                    Used for resume parsing, scoring, and smart matching. Obtain one from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Google AI Studio</a>.
                  </span>
                </div>
              )}

              {aiProvider === 'claude' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Anthropic Claude API Key</label>
                    {claudeConfigured && (
                      <span style={{ color: 'var(--status-offered)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ API Key Present
                      </span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder={claudeConfigured ? "•••••••• (Configured in Backend)" : "sk-ant-..."} 
                    value={claudeApiKey} 
                    onChange={(e) => setClaudeApiKey(e.target.value)} 
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                    Calls Claude 3.5 Sonnet to parse and score candidate files. Obtain one from <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Anthropic Console</a>.
                  </span>
                </div>
              )}

              {aiProvider === 'openai' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>OpenAI API Key</label>
                    {openaiConfigured && (
                      <span style={{ color: 'var(--status-offered)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ API Key Present
                      </span>
                    )}
                  </div>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder={openaiConfigured ? "•••••••• (Configured in Backend)" : "sk-..."} 
                    value={openaiApiKey} 
                    onChange={(e) => setOpenaiApiKey(e.target.value)} 
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                    Invokes GPT-4o-mini to analyze resumes. Obtain one from the <a href="https://platform.openai.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>OpenAI Platform</a>.
                  </span>
                </div>
              )}

              {aiProvider === 'ollama' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Ollama API URL</label>
                      <input type="text" className="form-input" placeholder="http://localhost:11434" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Model Name</label>
                      <input type="text" className="form-input" placeholder="llama3" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} />
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                    Connects to your locally running Ollama instance. Make sure Ollama is running and has access to the requested model. For instructions on running local models, visit <a href="https://ollama.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Ollama.com</a>.
                  </span>
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 24px' }} disabled={savingSettings}>
              {savingSettings ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
