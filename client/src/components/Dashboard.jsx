import React from 'react';
import { Users, FileText, Mail, CheckCircle2, XCircle, ArrowUpRight, TrendingUp } from 'lucide-react';

export default function Dashboard({ candidates, jobs, unreadCount, setActiveTab, rankAccordingToJob, emailProvider, currentRole }) {
  // Compute analytics
  const totalCandidates = candidates.length;
  const stageCounts = candidates.reduce((acc, c) => {
    acc[c.stage.toLowerCase()] = (acc[c.stage.toLowerCase()] || 0) + 1;
    return acc;
  }, {});

  const inboxCount = stageCounts['inbox'] || 0;
  const shortlistCount = stageCounts['shortlist'] || 0;
  const interviewCount = stageCounts['interview'] || 0;
  const offeredCount = stageCounts['offered'] || 0;
  const rejectedCount = stageCounts['rejected'] || 0;

  // Helper to get active score based on ranking mode
  const getCandidateScore = (c) => {
    return rankAccordingToJob ? c.matchScore : (c.ownCategoryScore ?? c.matchScore);
  };

  // Average compatibility score of candidates
  const scoredCandidates = candidates.filter(c => getCandidateScore(c) > 0);
  const avgScore = scoredCandidates.length 
    ? Math.round(scoredCandidates.reduce((acc, c) => acc + getCandidateScore(c), 0) / scoredCandidates.length) 
    : 0;

  // Get recent candidates
  const recentCandidates = [...candidates]
    .sort((a, b) => {
      const dateA = a.history?.[0]?.date ? new Date(a.history[0].date) : new Date(0);
      const dateB = b.history?.[0]?.date ? new Date(b.history[0].date) : new Date(0);
      return dateB - dateA;
    })
    .slice(0, 5);

  const isManager = currentRole === 'Hiring Manager';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Welcome Banner */}
      <div className="glass" style={{ 
        padding: '40px', 
        borderRadius: 'var(--radius-lg)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'var(--banner-bg)',
        border: '1px solid var(--banner-border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <h2 style={{ 
            fontSize: '32px', 
            marginBottom: '10px', 
            fontFamily: 'var(--font-display)', 
            fontWeight: '800',
            background: 'var(--banner-text-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {isManager ? 'Welcome back, Manager' : 'TalentFlow command center'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '600px', lineHeight: '1.6' }}>
            {isManager 
              ? 'Review the candidate profiles, scorecard compatibility matches, and tailored technical interview questions assigned to you.' 
              : 'Monitor candidate ingestion pipelines, track candidate matching diagnostics, and organize your recruitment workflow in real-time.'}
          </p>
        </div>
        {!isManager && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <button className="btn btn-primary" onClick={() => setActiveTab('inbox')} style={{ boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)' }}>
              <Mail size={16} /> Scan Active Sourcing Queue
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-cols-dashboard">
        {/* KPI 1 */}
        <div className="glass glass-interactive" style={{ padding: '28px 24px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--accent-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Positions</span>
            <span style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', borderRadius: 'var(--radius-sm)' }}>
              <FileText size={18} />
            </span>
          </div>
          <h3 style={{ fontSize: '38px', marginBottom: '6px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>{jobs.length}</h3>
          <span style={{ fontSize: '12px', color: 'var(--status-offered)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
            <TrendingUp size={13} /> {jobs.filter(j => j.status === 'Active').length || jobs.length} Active roles
          </span>
        </div>

        {/* KPI 2 */}
        <div className="glass glass-interactive" style={{ padding: '28px 24px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--accent-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isManager ? 'Assigned Profiles' : 'Total Sourced'}</span>
            <span style={{ padding: '8px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-secondary)', borderRadius: 'var(--radius-sm)' }}>
              <Users size={18} />
            </span>
          </div>
          <h3 style={{ fontSize: '38px', marginBottom: '6px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>{totalCandidates}</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {isManager ? 'Candidates shared for review' : 'From local uploads & email pollers'}
          </span>
        </div>

        {/* KPI 3 */}
        {isManager ? (
          <div className="glass glass-interactive" style={{ padding: '28px 24px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--status-inbox)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In Interview Stage</span>
              <span style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.1)', color: 'var(--status-interview)', borderRadius: 'var(--radius-sm)' }}>
                <CheckCircle2 size={18} />
              </span>
            </div>
            <h3 style={{ fontSize: '38px', marginBottom: '6px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>{interviewCount}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Profiles scheduled for interviewing</span>
          </div>
        ) : (
          <div className="glass glass-interactive" style={{ padding: '28px 24px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--status-inbox)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{emailProvider === 'outlook' ? 'Office 365 Queue' : 'Inbox Queue'}</span>
              <span style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--status-inbox)', borderRadius: 'var(--radius-sm)' }}>
                <Mail size={18} />
              </span>
            </div>
            <h3 style={{ fontSize: '38px', marginBottom: '6px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>{unreadCount}</h3>
            <span style={{ fontSize: '12px', color: unreadCount > 0 ? 'var(--status-shortlist)' : 'var(--text-muted)', fontWeight: '500' }}>
              {unreadCount > 0 ? 'Awaiting AI Extraction' : (emailProvider === 'outlook' ? 'Outlook empty' : 'Gmail empty')}
            </span>
          </div>
        )}

        {/* KPI 4 */}
        <div className="glass glass-interactive" style={{ padding: '28px 24px', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--status-offered)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Match Score</span>
            <span style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-offered)', borderRadius: 'var(--radius-sm)' }}>
              <CheckCircle2 size={18} />
            </span>
          </div>
          <h3 style={{ fontSize: '38px', marginBottom: '6px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>{avgScore}%</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Parsed compatibility check</span>
        </div>
      </div>

      {/* Main Panel grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '32px' }}>
        {/* Pipeline Distribution Chart / Cards */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
            <h3 style={{ fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>Pipeline Distribution</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>Active Pipelines</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Inbox */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-inbox)' }}></span> Inbox Sourced
                </span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{inboxCount} ({totalCandidates ? Math.round((inboxCount/totalCandidates)*100) : 0}%)</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, #3b82f6, #60a5fa)', width: `${totalCandidates ? (inboxCount/totalCandidates)*100 : 0}%` }}></div>
              </div>
            </div>

            {/* Shortlisted */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-shortlist)' }}></span> Shortlisted
                </span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{shortlistCount} ({totalCandidates ? Math.round((shortlistCount/totalCandidates)*100) : 0}%)</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, #eab308, #facc15)', width: `${totalCandidates ? (shortlistCount/totalCandidates)*100 : 0}%` }}></div>
              </div>
            </div>

            {/* Interviewing */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-interview)' }}></span> Technical Interviews
                </span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{interviewCount} ({totalCandidates ? Math.round((interviewCount/totalCandidates)*100) : 0}%)</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, #a855f7, #c084fc)', width: `${totalCandidates ? (interviewCount/totalCandidates)*100 : 0}%` }}></div>
              </div>
            </div>

            {/* Offered */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-offered)' }}></span> Offers Extended
                </span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{offeredCount} ({totalCandidates ? Math.round((offeredCount/totalCandidates)*100) : 0}%)</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, #10b981, #34d399)', width: `${totalCandidates ? (offeredCount/totalCandidates)*100 : 0}%` }}></div>
              </div>
            </div>

            {/* Rejected */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-rejected)' }}></span> Archived / Rejected
                </span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{rejectedCount} ({totalCandidates ? Math.round((rejectedCount/totalCandidates)*100) : 0}%)</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(to right, #f43f5e, #fb7185)', width: `${totalCandidates ? (rejectedCount/totalCandidates)*100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Sourced Candidates */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontFamily: 'var(--font-display)', fontWeight: '700' }}>Recent Sourced</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recentCandidates.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0', fontSize: '13px' }}>
                No candidate files imported yet.
              </div>
            ) : (
              recentCandidates.map(c => {
                const job = jobs.find(j => j.id === c.jobId);
                const score = getCandidateScore(c);
                const scoreColorClass = score >= 80 ? 'score-high' : score >= 50 ? 'score-medium' : 'score-low';
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{c.name}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{job ? job.title : 'General'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`score-badge ${scoreColorClass}`} style={{ width: '34px', height: '34px', fontSize: '12px', borderRadius: '50%' }}>
                        {score}
                      </span>
                      <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => setActiveTab('pipeline')}>
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
