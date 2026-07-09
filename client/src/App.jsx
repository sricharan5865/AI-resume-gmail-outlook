import { useState, useEffect } from 'react';
import { LayoutDashboard, Mail, GitCommit, Settings, CheckCircle2, AlertCircle, RefreshCw, Search, Sun, Moon, ClipboardList, BarChart3, Sparkles, KeyRound, Users } from 'lucide-react';

import Dashboard from './components/Dashboard';
import Inbox from './components/Inbox';
import PipelineBoard from './components/PipelineBoard';
import CandidateDetails from './components/CandidateDetails';
import EmailModal from './components/EmailModal';
import SettingsView from './components/Settings';
import IngestionTracker from './components/IngestionTracker';
import Reporting from './components/Reporting';
import RAGSearch from './components/RAGSearch';
import Login from './components/Login';
import UserManagement from './components/UserManagement';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

function safeLocalStorageGet(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value);
  } catch (error) {
    console.error(`Error parsing localStorage key "${key}":`, error);
    return fallback;
  }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => safeLocalStorageGet('user', null));

  const [activeTab, setActiveTab] = useState('dashboard');
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [settings, setSettings] = useState({ emailTemplates: {} });
  const [unreadCount, setUnreadCount] = useState(0);
  const [emailProvider, setEmailProvider] = useState('gmail');
  const [aiProvider, setAiProvider] = useState('gemini');
  const [emailConnectionError, setEmailConnectionError] = useState(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  
  // Dialog/modal overlay state
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [emailCandidate, setEmailCandidate] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('success');

  // Sync state variables
  const [syncing, setSyncing] = useState(false);
  
  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  
  // Ranking mode state
  const [rankAccordingToJob, setRankAccordingToJob] = useState(false);

  // Change Password Modal state
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.documentElement.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
      document.documentElement.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    // 1. Initial data fetch
    fetchData();

    // 2. Connect poll checks (every 30 seconds)
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchData(true); // silent fetch
    }, 30000);

    // 3. Immediately sync when switching tabs/windows back to the app
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData(true); // silent fetch
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchData = async (silent = false) => {
    if (!token) return;
    if (!silent) setSyncing(true);
    try {
      // Fetch Auth Status
      const authRes = await fetch(`${BACKEND_URL}/api/auth/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (authRes.status === 401 || authRes.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        setActiveTab('dashboard');
        return;
      }
      
      const authData = await authRes.json();
      setEmailProvider(authData.emailProvider || 'gmail');
      setAiProvider(authData.aiProvider || 'gemini');
      
      const isOutlook = (authData.emailProvider || 'gmail') === 'outlook';
      setEmailConnectionError(isOutlook ? authData.outlookConnectionError : authData.imapConnectionError);
      setEmailConfigured(isOutlook ? !!authData.outlookConfigured : !!authData.imapConfigured);
      setEmailConnected(isOutlook ? !!authData.outlookConnected : !!authData.imapConnected);

      // Fetch Jobs
      const jobsRes = await fetch(`${BACKEND_URL}/api/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(Array.isArray(jobsData) ? jobsData : []);
      } else {
        setJobs([]);
      }

      // Fetch Candidates
      const candidatesRes = await fetch(`${BACKEND_URL}/api/candidates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (candidatesRes.ok) {
        const candidatesData = await candidatesRes.json();
        setCandidates(Array.isArray(candidatesData) ? candidatesData : []);
      } else {
        setCandidates([]);
      }

      // Fetch Settings (Only if admin role)
      let settingsData = { emailTemplates: {} };
      if (user?.role === 'admin') {
        const settingsRes = await fetch(`${BACKEND_URL}/api/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (settingsRes.ok) {
          settingsData = await settingsRes.json();
        }
      }
      setSettings(settingsData || { emailTemplates: {} });
      setRankAccordingToJob(!!settingsData.rankAccordingToJob);

      // Fetch Gmail Sourcing unread queue count (if authenticated)
      if (authData.authenticated && user?.role !== 'manager') {
        const gmailRes = await fetch(`${BACKEND_URL}/api/gmail/emails`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (gmailRes.ok) {
          const gmailData = await gmailRes.json();
          setUnreadCount(gmailData.emails?.length || 0);
        }
      } else {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to sync application data:', error);
      if (!silent) {
        showToast('Server connection failed. Make sure the backend is running.', 'error');
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  // State handlers
  const handleStageChanged = (candidateId, newStage) => {
    // Optimistic UI updates
    setCandidates(prev => prev.map(c => {
      if (c.id === candidateId) {
        return {
          ...c,
          stage: newStage,
          history: [
            ...c.history,
            {
              date: new Date().toISOString(),
              type: 'StageChanged',
              text: `Moved candidate pipeline stage to "${newStage}"`
            }
          ]
        };
      }
      return c;
    }));

    // Update selected candidate details if open
    if (selectedCandidate?.id === candidateId) {
      setSelectedCandidate(prev => ({
        ...prev,
        stage: newStage,
        history: [
          ...prev.history,
          {
            date: new Date().toISOString(),
            type: 'StageChanged',
            text: `Moved candidate pipeline stage to "${newStage}"`
          }
        ]
      }));
    }
  };

  const handleEmailSent = (candidateId) => {
    // Refresh database candidate logs
    fetchData(true);
    showToast('Recruitment letter sent successfully!', 'success');
  };

  const handleToggleRankingMode = async () => {
    const newVal = !rankAccordingToJob;
    setRankAccordingToJob(newVal);
    try {
      await fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rankAccordingToJob: newVal })
      });
      showToast(`Ranking mode switched to: ${newVal ? 'According to Job' : 'By Own Category'}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save ranking mode setting.', 'error');
    }
  };

  const handleCandidateImported = (newCandidate, isUpdate = false) => {
    setCandidates(prev => {
      const exists = prev.some(c => c.id === newCandidate.id);
      if (exists) {
        return prev.map(c => c.id === newCandidate.id ? newCandidate : c);
      } else {
        return [...prev, newCandidate];
      }
    });
    showToast(`Successfully ${isUpdate ? 'updated' : 'extracted'} ${newCandidate.name} ${isUpdate ? 'in' : 'to'} the pipeline!`, 'success');
    // Open candidate details automatically to see ranking
    setSelectedCandidate(newCandidate);
  };

  const handleCandidateDeleted = (candidateId) => {
    setCandidates(prev => prev.filter(c => c.id !== candidateId));
    setSelectedCandidate(null);
    showToast('Candidate deleted successfully.', 'success');
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Password update failed');
      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setShowPasswordChangeModal(false), 2000);
    } catch (err) {
      setPasswordError(err.message);
    }
  };

  if (!token) {
    return <Login backendUrl={BACKEND_URL} onLoginSuccess={(newToken, loggedInUser) => {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      setToken(newToken);
      setUser(loggedInUser);
      showToast(`Welcome back, ${loggedInUser.email}!`, 'success');
    }} />;
  }

  const mappedRole = user?.role === 'admin' ? 'Admin' : user?.role === 'recruiter' ? 'Recruiter' : 'Hiring Manager';

  return (
    <div className="app-container">
      
      {/* Toast Notification HUD */}
      {toastMessage && (
        <div 
          className="glass" 
          style={{ 
            position: 'fixed', 
            top: '24px', 
            right: '24px', 
            padding: '16px 24px', 
            borderRadius: 'var(--radius-md)', 
            zIndex: 1000, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            borderLeft: toastType === 'success' ? '4px solid var(--status-offered)' : '4px solid var(--status-rejected)',
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {toastType === 'success' ? (
            <CheckCircle2 size={18} style={{ color: 'var(--status-offered)' }} />
          ) : (
            <AlertCircle size={18} style={{ color: 'var(--status-rejected)' }} />
          )}
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Sidebar */}
      <div className="sidebar glass">
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 8px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <GitCommit size={22} style={{ transform: 'rotate(45deg)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', lineHeight: 1 }}>TalentFlow</h1>
            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI Sourcing Engine
            </span>
          </div>
        </div>

        {/* Navigation items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'dashboard' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: activeTab === 'dashboard' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderLeft: activeTab === 'dashboard' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              marginLeft: '-16px',
              paddingLeft: '28px'
            }}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>
          
          {user?.role !== 'manager' && (
            <button 
              className="btn" 
              style={{ 
                justifyContent: 'flex-start',
                background: activeTab === 'inbox' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                color: activeTab === 'inbox' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeft: activeTab === 'inbox' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                marginLeft: '-16px',
                paddingLeft: '28px',
                position: 'relative'
              }}
              onClick={() => setActiveTab('inbox')}
            >
              <Mail size={16} /> {emailProvider === 'outlook' ? 'Outlook Sourcing' : 'Gmail Sourcing'}
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', right: '16px', top: '12px', fontSize: '10px', background: 'var(--status-inbox)', color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: '700' }}>
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'pipeline' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: activeTab === 'pipeline' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderLeft: activeTab === 'pipeline' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              marginLeft: '-16px',
              paddingLeft: '28px'
            }}
            onClick={() => setActiveTab('pipeline')}
          >
            <GitCommit size={16} /> Pipeline Board
          </button>


          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'ai-search' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: activeTab === 'ai-search' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderLeft: activeTab === 'ai-search' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              marginLeft: '-16px',
              paddingLeft: '28px'
            }}
            onClick={() => setActiveTab('ai-search')}
          >
            <Sparkles size={16} /> AI Search
          </button>

          {user?.role !== 'manager' && (
            <button 
              className="btn" 
              style={{ 
                justifyContent: 'flex-start',
                background: activeTab === 'ingestion' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                color: activeTab === 'ingestion' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeft: activeTab === 'ingestion' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                marginLeft: '-16px',
                paddingLeft: '28px'
              }}
              onClick={() => setActiveTab('ingestion')}
            >
              <ClipboardList size={16} /> Ingestion Tracker
            </button>
          )}

          <button 
            className="btn" 
            style={{ 
              justifyContent: 'flex-start',
              background: activeTab === 'reporting' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: activeTab === 'reporting' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderLeft: activeTab === 'reporting' ? '3px solid var(--accent-primary)' : '3px solid transparent',
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              marginLeft: '-16px',
              paddingLeft: '28px'
            }}
            onClick={() => setActiveTab('reporting')}
          >
            <BarChart3 size={16} /> Reporting & Analytics
          </button>

          {user?.role === 'admin' && (
            <button 
              className="btn" 
              style={{ 
                justifyContent: 'flex-start',
                background: activeTab === 'settings' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                color: activeTab === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeft: activeTab === 'settings' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                marginLeft: '-16px',
                paddingLeft: '28px'
              }}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} /> Settings
            </button>
          )}

          {user?.role === 'admin' && (
            <button 
              className="btn" 
              style={{ 
                justifyContent: 'flex-start',
                background: activeTab === 'users' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                color: activeTab === 'users' ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeft: activeTab === 'users' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                marginLeft: '-16px',
                paddingLeft: '28px'
              }}
              onClick={() => setActiveTab('users')}
            >
              <Users size={16} /> User Control
            </button>
          )}
        </div>

        {/* Sidebar Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
          {user?.role === 'admin' && (
            <>
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontSize: '11px', 
                  color: emailConnected 
                    ? 'var(--status-offered)' 
                    : emailConnectionError 
                      ? 'var(--status-rejected)' 
                      : emailConfigured
                        ? '#fbbf24'
                        : 'var(--text-muted)', 
                  background: emailConnected 
                    ? 'rgba(16, 185, 129, 0.06)' 
                    : emailConnectionError 
                      ? 'rgba(244, 63, 94, 0.06)' 
                      : emailConfigured
                        ? 'rgba(251, 191, 36, 0.06)'
                        : 'var(--bg-secondary)', 
                  padding: '8px 12px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: emailConnected 
                    ? '1px solid rgba(16, 185, 129, 0.15)' 
                    : emailConnectionError 
                      ? '1px solid rgba(244, 63, 94, 0.15)' 
                      : emailConfigured
                        ? '1px solid rgba(251, 191, 36, 0.15)'
                        : '1px solid var(--glass-border)',
                  cursor: emailConnectionError ? 'help' : 'default'
                }}
                title={emailConnectionError ? `Connection Error: ${emailConnectionError}` : ''}
              >
                <span 
                  className={emailConnected ? "status-dot-active" : ""} 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    background: emailConnected 
                      ? 'var(--status-offered)' 
                      : emailConnectionError 
                        ? 'var(--status-rejected)' 
                        : emailConfigured
                          ? '#fbbf24'
                          : 'var(--text-muted)', 
                    display: 'inline-block' 
                  }}
                />
                Channel: {emailProvider === 'outlook' ? 'Outlook 365' : 'Gmail'} {emailConnectionError ? '(Error)' : emailConnected ? '' : emailConfigured ? '(Verifying...)' : '(Unconfigured)'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--status-interview)', background: 'rgba(168, 85, 247, 0.06)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168, 85, 247, 0.15)' }}>
                <span className="status-dot-purple" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-interview)', display: 'inline-block' }}></span>
                AI Agent: {aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'claude' ? 'Claude' : aiProvider === 'openai' ? 'OpenAI' : aiProvider === 'ollama' ? 'Ollama' : 'Gemini'}
              </div>
            </>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyStyle: 'space-between', width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>User Account</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
                  {user?.email}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>
                  {user?.role === 'admin' ? 'Administrator' : user?.role === 'recruiter' ? 'HR Recruiter' : 'Hiring Manager'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: '4px' }}>
              <button
                onClick={() => {
                  setPasswordError('');
                  setPasswordSuccess('');
                  setShowPasswordChangeModal(true);
                }}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <KeyRound size={10} /> Password
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  setToken(null);
                  setUser(null);
                  setActiveTab('dashboard');
                  showToast('Logged out successfully', 'success');
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlignment: 'center', marginTop: '4px' }}>
            v1.1.0 (Multi-Agent Engine)
          </span>
        </div>
      </div>

      {/* Main Core Pane */}
      <div className="main-content">
        
        {/* Top Header */}
        <header className="header glass">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: 0 }}>
              {activeTab === 'dashboard' && 'Recruitment Analytics'}
              {activeTab === 'inbox' && (emailProvider === 'outlook' ? 'Outlook Sourcing Queue' : 'Gmail Sourcing Queue')}
              {activeTab === 'pipeline' && 'Talent Pipeline Kanban'}
              {activeTab === 'ai-search' && 'AI Resume Search'}
              {activeTab === 'ingestion' && 'Ingestion & Upload Log'}
              {activeTab === 'reporting' && 'Reporting & Analytics'}
              {activeTab === 'settings' && 'System Configuration'}
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* According to Job Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>According to Job</span>
              <button 
                onClick={handleToggleRankingMode}
                style={{
                  width: '42px',
                  height: '24px',
                  borderRadius: '12px',
                  background: rankAccordingToJob ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--glass-border)',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.3s',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={rankAccordingToJob ? 'Currently ranking against selected Job. Click to rank by profile category.' : 'Currently ranking by Profile Category. Click to rank against selected Job.'}
              >
                <div 
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: rankAccordingToJob ? '22px' : '2px',
                    transition: 'left 0.3s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}
                />
              </button>
            </div>

            <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => fetchData()} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} style={{ animation: syncing ? 'spin 1.5s linear infinite' : 'none' }} /> Sync Data
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ 
                padding: '8px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                width: '36px', 
                height: '36px',
                transition: 'transform 0.3s ease, background-color 0.2s' 
              }} 
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={16} style={{ color: '#fbbf24' }} /> : <Moon size={16} style={{ color: '#a855f7' }} />}
            </button>
          </div>
        </header>

        {/* Content Panel Scroll */}
        <main className="content-pane" style={{ position: 'relative', height: '100%' }}>
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none', height: '100%' }}>
            <Dashboard 
              candidates={candidates} 
              jobs={jobs} 
              unreadCount={unreadCount} 
              setActiveTab={setActiveTab} 
              rankAccordingToJob={rankAccordingToJob}
              emailProvider={emailProvider}
              currentRole={mappedRole}
            />
          </div>

          <div style={{ display: activeTab === 'inbox' ? 'block' : 'none', height: '100%' }}>
            <Inbox 
              token={token}
              jobs={jobs} 
              onCandidateImported={handleCandidateImported}
              backendUrl={BACKEND_URL}
              emailProvider={emailProvider}
            />
          </div>

          <div style={{ display: activeTab === 'pipeline' ? 'block' : 'none', height: '100%' }}>
            <PipelineBoard 
              candidates={candidates} 
              jobs={jobs} 
              onStageChanged={handleStageChanged}
              onSelectCandidate={setSelectedCandidate}
              onOpenEmailModal={setEmailCandidate}
              onManualUpload={handleCandidateImported}
              onCandidateDeleted={handleCandidateDeleted}
              backendUrl={BACKEND_URL}
              rankAccordingToJob={rankAccordingToJob}
              token={token}
            />
          </div>
          

          <div style={{ display: activeTab === 'ai-search' ? 'block' : 'none', height: '100%' }}>
            <RAGSearch
              candidates={candidates}
              onViewCandidate={setSelectedCandidate}
              onEmailCandidate={setEmailCandidate}
              showToast={showToast}
              BACKEND_URL={BACKEND_URL}
              token={token}
            />
          </div>

          <div style={{ display: activeTab === 'ingestion' ? 'block' : 'none', height: '100%' }}>
            <IngestionTracker backendUrl={BACKEND_URL} isActive={activeTab === 'ingestion'} token={token} />
          </div>

          <div style={{ display: activeTab === 'reporting' ? 'block' : 'none', height: '100%' }}>
            <Reporting candidates={candidates} jobs={jobs} />
          </div>

          <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
            <SettingsView 
              jobs={jobs} 
              templates={settings.emailTemplates}
              onJobCreated={(newJob) => setJobs(prev => [...prev, newJob])}
              onJobDeleted={(id) => setJobs(prev => prev.filter(j => j.id !== id))}
              onJobUpdated={(updatedJob) => setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j))}
              onSettingsSaved={fetchData}
              backendUrl={BACKEND_URL}
              currentRole={mappedRole}
              token={token}
            />
          </div>

          {user?.role === 'admin' && (
            <div style={{ display: activeTab === 'users' ? 'block' : 'none', height: '100%' }}>
              <UserManagement backendUrl={BACKEND_URL} token={token} />
            </div>
          )}
        </main>
      </div>

      {/* Drawer Overlay: Candidate Details */}
      {selectedCandidate && (
        <CandidateDetails 
          candidate={selectedCandidate}
          job={jobs.find(j => j.id === selectedCandidate.jobId)}
          onClose={() => setSelectedCandidate(null)}
          onOpenEmailModal={(c) => {
            setSelectedCandidate(null);
            setEmailCandidate(c);
          }}
          onStageChanged={handleStageChanged}
          onCandidateDeleted={handleCandidateDeleted}
          backendUrl={BACKEND_URL}
          rankAccordingToJob={rankAccordingToJob}
          currentRole={mappedRole}
          token={token}
        />
      )}

      {/* Modal Overlay: Email Sender */}
      {emailCandidate && (
        <EmailModal 
          candidate={emailCandidate}
          job={jobs.find(j => j.id === emailCandidate.jobId)}
          templates={settings.emailTemplates}
          onClose={() => setEmailCandidate(null)}
          onEmailSent={handleEmailSent}
          backendUrl={BACKEND_URL}
          token={token}
        />
      )}

      {/* Change Password Modal */}
      {showPasswordChangeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '2rem',
            width: '100%',
            maxWidth: '400px',
            color: '#fff'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={20} color="#6366f1" /> Change Password
            </h3>
            
            {passwordError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#7f1d1d', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {passwordError}
              </div>
            )}
            
            {passwordSuccess && (
              <div style={{ padding: '8px 12px', backgroundColor: '#064e3b', color: '#a7f3d0', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', color: '#94a3b8' }}>Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', color: '#94a3b8' }}>New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', color: '#94a3b8' }}>Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '0.6rem', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Save Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasswordChangeModal(false)}
                  style={{ padding: '0.6rem 1rem', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
