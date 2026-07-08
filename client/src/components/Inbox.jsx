import { useState, useEffect } from 'react';
import { Mail, RefreshCw, Paperclip, CheckCircle2, AlertCircle, Play, Loader, Trash2, Search } from 'lucide-react';

export default function Inbox({ token, jobs, onCandidateImported, backendUrl, emailProvider: emailProviderProp }) {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailProviderLocal, setEmailProviderLocal] = useState('gmail');
  const emailProvider = emailProviderProp || emailProviderLocal;
  
  const [connectionError, setConnectionError] = useState(null);
  
  // Search and Sort states for emails queue
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterDate, setFilterDate] = useState('');

  // Filter and sort emails by subject, sender, snippet, and date of receipt
  const filteredAndSortedEmails = emails
    .filter(email => {
      // 1. Text Search Filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const fromMatch = (email.from || '').toLowerCase().includes(term);
        const subjectMatch = (email.subject || '').toLowerCase().includes(term);
        const snippetMatch = (email.snippet || '').toLowerCase().includes(term);
        
        const emailDate = new Date(email.date);
        const dateStr = emailDate.toLocaleDateString().toLowerCase();
        const dateLongStr = emailDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase();
        const dateMatch = dateStr.includes(term) || dateLongStr.includes(term);
        
        if (!fromMatch && !subjectMatch && !snippetMatch && !dateMatch) {
          return false;
        }
      }

      // 2. Specific Date of Receipt Filter
      if (filterDate) {
        const emailDate = new Date(email.date);
        const filterDateObj = new Date(filterDate);
        
        const isSameDay = emailDate.getFullYear() === filterDateObj.getFullYear() &&
                          emailDate.getMonth() === filterDateObj.getMonth() &&
                          emailDate.getDate() === filterDateObj.getDate();
        if (!isSameDay) return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (sortBy === 'newest') return dateB - dateA;
      if (sortBy === 'oldest') return dateA - dateB;
      return 0;
    });

  
  // Sourcing extraction progress state
  // Sourcing extraction progress state
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');
  const [activeTab, setActiveTab] = useState('pdf');

  const fetchEmails = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${backendUrl}/api/gmail/emails`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          return;
        }
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to retrieve emails');
      }
      const data = await res.json();
      setEmails(data.emails || []);
      if (data.emails && data.emails.length > 0) {
        setSelectedEmail(data.emails[0]);
      } else {
        setSelectedEmail(null);
      }
    } catch (e) {
      console.error('Error fetching emails:', e);
      setError(e.message || 'Could not fetch emails. Verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  const checkAuthStatus = async () => {
    try {
      setAuthLoading(true);
      const res = await fetch(`${backendUrl}/api/auth/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
      setEmailProviderLocal(data.emailProvider || 'gmail');
      
      const isProviderOutlook = (data.emailProvider || 'gmail') === 'outlook';
      const providerError = isProviderOutlook ? data.outlookConnectionError : data.imapConnectionError;
      const providerConfigured = isProviderOutlook ? data.outlookConfigured : data.imapConfigured;
      
      setConnectionError(providerError || null);
      
      if (data.authenticated) {
        fetchEmails();
      }
    } catch (e) {
      console.error('Error checking authentication status:', e);
      setError('Backend server connection failed. Make sure the backend is running.');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkAuthStatus();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExtractCandidate = async (attachmentId) => {
    try {
      setExtracting(true);
      setError('');
      
      // Step-by-step progress simulation for a premium UX
      setExtractProgress(`Connecting to ${emailProvider === 'outlook' ? 'Outlook' : 'Gmail'} API & downloading PDF...`);
      await new Promise(r => setTimeout(r, 1200));
      
      setExtractProgress('Extracting raw resume text structure...');
      await new Promise(r => setTimeout(r, 1000));
      
      setExtractProgress('Invoking Gemini API for structured JSON extraction...');
      
      const reqBody = {
        messageId: selectedEmail.id,
        attachmentId
      };
      if (selectedJobId) {
        reqBody.jobId = selectedJobId;
      }
      
      const res = await fetch(`${backendUrl}/api/candidates/extract-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(reqBody)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to extract candidate.');
      }
      
      setExtractProgress('Gemini completed. Analyzing matching index and score...');
      await new Promise(r => setTimeout(r, 800));
      
      const newCandidate = await res.json();
      
      setExtractProgress('Candidate saved in pipeline successfully!');
      await new Promise(r => setTimeout(r, 600));

      // Remove the successfully parsed email from the list
      setEmails(prev => prev.filter(e => e.id !== selectedEmail.id));
      setSelectedEmail(null);
      
      onCandidateImported(newCandidate);
    } catch (e) {
      console.error('Extraction error:', e);
      setError(e.message || 'Parsing failed. Check API key configurations.');
    } finally {
      setExtracting(false);
      setExtractProgress('');
    }
  };

  const handleDismissEmail = async (emailId) => {
    if (!window.confirm("Are you sure you want to dismiss this email? It will be removed from the queue and never imported.")) return;
    if (!window.confirm("Are you absolutely sure you want to dismiss this email? This action cannot be undone.")) return;
    try {
      setExtracting(true);
      setExtractProgress('Dismissing email...');
      const res = await fetch(`${backendUrl}/api/gmail/emails/${emailId}/dismiss`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to dismiss email');
      }
      
      // Remove email from state
      setEmails(prev => prev.filter(e => e.id !== emailId));
      setSelectedEmail(null);
      alert('Email dismissed successfully.');
    } catch (e) {
      console.error(e);
      alert(e.message || 'Error dismissing email.');
    } finally {
      setExtracting(false);
      setExtractProgress('');
    }
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
        <Loader size={48} className="animate-spin" style={{ color: 'var(--accent-primary)', animation: 'spin 1.5s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Verifying Sourcing Server Status...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="glass" style={{ padding: '48px', borderRadius: 'var(--radius-lg)', maxWidth: '550px', width: '100%', textAlign: 'center' }}>
          
          {error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '50%', color: 'var(--status-rejected)' }}>
                <AlertCircle size={48} />
              </div>
              <h2 style={{ fontSize: '22px' }}>Connection Failure</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                {error}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Ensure your backend server is running and accessible.
              </p>
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: '16px' }} onClick={checkAuthStatus}>
                <RefreshCw size={14} /> Retry Connection
              </button>
            </div>
          ) : connectionError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '50%', color: 'var(--status-rejected)' }}>
                <AlertCircle size={48} />
              </div>
              <h2 style={{ fontSize: '22px' }}>Email Connection Error</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                The TalentFlow sourcing agent failed to connect to your {emailProvider === 'outlook' ? 'Outlook' : 'Gmail'} account.
              </p>
              <div style={{ 
                width: '100%', padding: '16px', background: 'rgba(0, 0, 0, 0.2)', 
                borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)',
                textAlign: 'left', fontFamily: 'monospace', fontSize: '12px', color: '#f43f5e',
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
              }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>Error Details:</strong>
                {connectionError}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Please verify your active provider credentials or Azure AD App Registration on the <strong>Settings</strong> page.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={checkAuthStatus}>
                <RefreshCw size={14} /> Recheck Connection
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '50%', color: 'var(--accent-primary)', marginBottom: '24px' }}>
                <Mail size={48} />
              </div>
              <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Setup Email Sourcing Channel</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '32px' }}>
                To fetch resumes directly from your inbox, configure your active email provider ({emailProvider === 'outlook' ? 'Outlook / Office 365' : 'Gmail'}) and account credentials in the <strong>Settings</strong> panel.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', padding: '12px 24px', fontSize: '15px' }} onClick={checkAuthStatus}>
                <RefreshCw size={16} /> Check Connection Status
              </button>
            </>
          )}

        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', height: '100%', overflow: 'hidden' }}>
      
      {/* Emails List Column */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={18} /> {emailProvider === 'outlook' ? 'Outlook' : 'Gmail'} Sourcing Queue
          </h3>
          <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={fetchEmails} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ animation: loading ? 'spin 1.5s linear infinite' : 'none' }} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '12px 20px', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--status-rejected)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderBottom: '1px solid rgba(244, 63, 94, 0.2)' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Search and Sort Sub-bar */}
        <div style={{ 
          padding: '12px 20px', 
          borderBottom: '1px solid var(--glass-border)', 
          background: 'rgba(255, 255, 255, 0.01)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Search Input */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input 
              type="text" 
              placeholder="Search sender, subject, content..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ 
                paddingLeft: '32px', 
                width: '100%',
                fontSize: '13px',
                height: '36px',
                borderRadius: 'var(--radius-md)'
              }}
            />
          </div>
          
          {/* Date Selector & Sort Dropdown */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Date:</span>
              <input 
                type="date" 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="form-input"
                style={{ 
                  fontSize: '12px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  flexGrow: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)'
                }}
              />
              {filterDate && (
                <button 
                  onClick={() => setFilterDate('')}
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: 'var(--text-muted)', 
                    cursor: 'pointer', 
                    fontSize: '11px',
                    padding: '2px 4px',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => e.target.style.color = 'var(--status-rejected)'}
                  onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
                >
                  Clear
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Sort:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="form-input"
                style={{ 
                  width: '95px', 
                  fontSize: '12px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0 4px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)'
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
              <Loader size={32} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Scanning inbox for resumes...</p>
            </div>
          ) : emails.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--status-offered)', margin: '0 auto 16px auto', display: 'block' }} />
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>All caught up!</h4>
              <p style={{ fontSize: '13px' }}>No unread emails containing PDF resumes found.</p>
            </div>
          ) : filteredAndSortedEmails.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-secondary)' }}>
              <Search size={36} style={{ color: 'var(--text-secondary)', margin: '0 auto 16px auto', display: 'block', opacity: 0.5 }} />
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>No matching results</h4>
              <p style={{ fontSize: '13px' }}>Adjust your keywords or selected date.</p>
            </div>
          ) : (
            filteredAndSortedEmails.map(email => (
              <div 
                key={email.id} 
                className="glass-interactive"
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid var(--glass-border)', 
                  cursor: 'pointer',
                  background: selectedEmail?.id === email.id ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                  borderLeft: selectedEmail?.id === email.id ? '3px solid var(--accent-primary)' : '3px solid transparent'
                }}
                onClick={() => { setSelectedEmail(email); setActiveTab('pdf'); }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600', fontSize: '13px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.from.split('<')[0].trim()}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {new Date(email.date).toLocaleDateString()}
                  </span>
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4', marginBottom: '8px' }}>
                  {email.snippet}
                </p>
                {email.attachments.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-primary)' }}>
                    <Paperclip size={12} />
                    <span>{email.attachments[0].filename}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selected Email Details Column */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedEmail ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Header info */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)', background: 'var(--inbox-header-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>{selectedEmail.subject}</h3>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    From: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.from}</strong>
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(selectedEmail.date).toLocaleString()}
                </span>
              </div>

              {/* Extraction Control Drawer */}
              {selectedEmail.attachments.length > 0 ? (
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
                      <Paperclip size={14} style={{ color: 'var(--accent-primary)' }} />
                      Resume Found: <strong style={{ color: 'var(--text-primary)' }}>{selectedEmail.attachments[0].filename}</strong>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {(selectedEmail.attachments[0].size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ flexGrow: 1 }}>
                      <select 
                        className="form-input" 
                        value={selectedJobId} 
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        style={{ padding: '8px 12px', fontSize: '13px' }}
                      >
                        <option value="">-- Choose Job Description --</option>
                        {jobs.map(job => (
                          <option key={job.id} value={job.id}>{job.title} ({job.department})</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '8px 16px', flexShrink: 0 }}
                      onClick={() => handleExtractCandidate(selectedEmail.attachments[0].attachmentId)}
                      disabled={extracting}
                    >
                      {extracting ? (
                        <>
                          <Loader size={14} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} /> Processing...
                        </>
                      ) : (
                        <>
                          <Play size={14} /> AI Parse & Rank
                        </>
                      )}
                    </button>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '8px 16px', flexShrink: 0 }}
                      onClick={() => handleDismissEmail(selectedEmail.id)}
                      disabled={extracting}
                    >
                      <Trash2 size={14} /> Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--status-shortlist)' }}>
                  <AlertCircle size={16} />
                  <span>No PDF attachments found in this email. Cannot auto-extract.</span>
                </div>
              )}
            </div>

            {/* Content Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', background: 'var(--inbox-header-bg)' }}>
              <button 
                onClick={() => setActiveTab('pdf')} 
                style={{ 
                  padding: '12px 24px', 
                  background: activeTab === 'pdf' ? 'rgba(99,102,241,0.1)' : 'transparent', 
                  color: activeTab === 'pdf' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: activeTab === 'pdf' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  fontWeight: activeTab === 'pdf' ? '600' : '400'
                }}
              >
                PDF Preview
              </button>
              <button 
                onClick={() => setActiveTab('email')} 
                style={{ 
                  padding: '12px 24px', 
                  background: activeTab === 'email' ? 'rgba(99,102,241,0.1)' : 'transparent', 
                  color: activeTab === 'email' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: activeTab === 'email' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  fontWeight: activeTab === 'email' ? '600' : '400'
                }}
              >
                Email Body
              </button>
            </div>

            {/* Tab Content */}
            <div style={{ flexGrow: 1, overflowY: 'auto', background: 'var(--bg-secondary)', position: 'relative' }}>
              {activeTab === 'email' && (
                <div 
                  style={{ 
                    padding: '24px',
                    whiteSpace: 'pre-wrap', 
                    fontFamily: 'var(--font-body)', 
                    fontSize: '14px', 
                    lineHeight: '1.6', 
                    color: 'var(--text-primary)' 
                  }}
                >
                  {selectedEmail.body || 'No text content available in body.'}
                </div>
              )}
              {activeTab === 'pdf' && selectedEmail.attachments.length > 0 && (
                <iframe 
                  src={`${backendUrl}/api/gmail/attachment/${selectedEmail.id}/${selectedEmail.attachments[0].attachmentId}?token=${token}#toolbar=0`} 
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} 
                  title="PDF Preview"
                />
              )}
              {activeTab === 'pdf' && selectedEmail.attachments.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  No PDF attachment found in this email.
                </div>
              )}
            </div>

            {/* Sourcing HUD Loading Overlay */}
            {extracting && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--overlay-bg)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '32px' }}>
                <div style={{ position: 'relative', width: '80px', height: '80px' }}>
                  <div style={{ position: 'absolute', border: '4px solid rgba(99, 102, 241, 0.1)', borderTop: '4px solid var(--accent-primary)', borderRadius: '50%', width: '100%', height: '100%', animation: 'spin 1s linear infinite' }}></div>
                  <div style={{ position: 'absolute', border: '4px solid transparent', borderBottom: '4px solid var(--accent-secondary)', borderRadius: '50%', width: '100%', height: '100%', animation: 'spin 2s linear reverse infinite' }}></div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'white' }}>TalentFlow AI Parser</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', minHeight: '24px' }}>
                    {extractProgress}
                  </p>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%', 
            color: 'var(--text-secondary)', 
            gap: '24px',
            padding: '40px',
            margin: '24px',
            border: '2px dashed rgba(99, 102, 241, 0.15)',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(99, 102, 241, 0.02)',
            animation: 'fadeIn 0.5s ease-out'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '80px', 
              height: '80px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.1)', 
              color: 'var(--accent-primary)',
              boxShadow: '0 0 25px rgba(99, 102, 241, 0.25)' 
            }}>
              <Mail size={36} />
            </div>
            <div style={{ textAlign: 'center', maxWidth: '320px' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px', fontWeight: '600' }}>No Sourcing Email Selected</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Select an email from the queue on the left to inspect applicant details and parse the resume attachment.
              </p>
            </div>
            {/* Skeuomorphic Skeleton Preview Lines */}
            <div style={{ width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.1, marginTop: '12px' }}>
              <div style={{ height: '10px', background: 'var(--text-secondary)', borderRadius: '4px', width: '60%' }}></div>
              <div style={{ height: '8px', background: 'var(--text-secondary)', borderRadius: '4px', width: '100%' }}></div>
              <div style={{ height: '8px', background: 'var(--text-secondary)', borderRadius: '4px', width: '85%' }}></div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
