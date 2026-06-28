import React from 'react';
import { TrendingUp, Award, Mail, Users, FileText, ChevronRight, PieChart } from 'lucide-react';

export default function Reporting({ candidates, jobs }) {
  const totalCandidates = candidates.length;

  // 1. Pipeline Funnel
  const stages = ['Inbox', 'Shortlist', 'Interview', 'Offered', 'Rejected'];
  const stageCounts = candidates.reduce((acc, c) => {
    const stage = c.stage || 'Inbox';
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  // Cumulative funnel calculation: a candidate in Interview passed through Inbox & Shortlist
  const funnelData = {
    'Sourced': totalCandidates,
    'Shortlisted': (stageCounts['Shortlist'] || 0) + (stageCounts['Interview'] || 0) + (stageCounts['Offered'] || 0),
    'Interviewed': (stageCounts['Interview'] || 0) + (stageCounts['Offered'] || 0),
    'Offered': stageCounts['Offered'] || 0
  };

  // 2. Score Distribution
  const scoreBands = {
    'Excellent (90-100)': 0,
    'Good (70-89)': 0,
    'Average (50-69)': 0,
    'Poor (<50)': 0
  };

  candidates.forEach(c => {
    const score = c.matchScore || c.ownCategoryScore || 0;
    if (score >= 90) scoreBands['Excellent (90-100)']++;
    else if (score >= 70) scoreBands['Good (70-89)']++;
    else if (score >= 50) scoreBands['Average (50-69)']++;
    else scoreBands['Poor (<50)']++;
  });

  // 3. Sourcing Channels
  const channels = {
    'Manual Upload': 0,
    'Gmail Integration': 0,
    'Outlook Integration': 0
  };

  // We can infer source from candidate history or tags/emails
  candidates.forEach(c => {
    const importHistory = c.history?.find(h => h.type === 'Imported')?.text || '';
    if (importHistory.toLowerCase().includes('gmail') || importHistory.toLowerCase().includes('imap')) {
      channels['Gmail Integration']++;
    } else if (importHistory.toLowerCase().includes('outlook') || importHistory.toLowerCase().includes('microsoft')) {
      channels['Outlook Integration']++;
    } else {
      channels['Manual Upload']++;
    }
  });

  // 4. Seniority Distribution
  const seniorityCounts = {
    'Junior': 0,
    'Mid': 0,
    'Senior': 0,
    'Lead': 0,
    'Executive': 0
  };

  candidates.forEach(c => {
    const level = c.seniorityLevel || 'Mid';
    const normalized = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
    if (seniorityCounts[normalized] !== undefined) {
      seniorityCounts[normalized]++;
    } else {
      seniorityCounts['Mid']++;
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontFamily: 'var(--font-display)', fontWeight: '800', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Recruitment Reporting & Analytics
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Pipeline efficiency metrics, scoring profiles, and ingestion analytics.
          </p>
        </div>
      </div>

      {/* Grid of Analytical Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        {/* 1. Pipeline Funnel Analytics */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-primary)' }} />
            Recruitment Funnel Conversion
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.entries(funnelData).map(([label, count], index, arr) => {
              const maxCount = arr[0][1] || 1;
              const widthPct = Math.max(10, (count / maxCount) * 100);
              const conversionRate = index > 0 && arr[index - 1][1] 
                ? Math.round((count / arr[index - 1][1]) * 100) 
                : 100;

              return (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>{label}</span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{count}</span>
                      {index > 0 && (
                        <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-offered)', padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                          {conversionRate}% rate
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height: '24px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ 
                      height: '100%', 
                      background: `linear-gradient(to right, rgba(99, 102, 241, ${1 - index * 0.2}), rgba(139, 92, 246, ${1 - index * 0.2}))`, 
                      width: `${widthPct}%`,
                      transition: 'width 0.8s ease-in-out'
                    }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Score Band Distribution */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} style={{ color: 'var(--status-shortlist)' }} />
            Match Score Distribution
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.entries(scoreBands).map(([band, count]) => {
              const pct = totalCandidates ? Math.round((count / totalCandidates) * 100) : 0;
              let bandColor = 'var(--status-rejected)';
              if (band.includes('Excellent')) bandColor = 'var(--status-offered)';
              else if (band.includes('Good')) bandColor = 'var(--status-shortlist)';
              else if (band.includes('Average')) bandColor = 'var(--status-interview)';

              return (
                <div key={band}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '500' }}>{band}</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: bandColor, width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Sourcing Channel Efficacy */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={18} style={{ color: 'var(--status-inbox)' }} />
            Sourcing Channel Breakdowns
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.entries(channels).map(([channel, count]) => {
              const pct = totalCandidates ? Math.round((count / totalCandidates) * 100) : 0;
              let channelIconColor = 'var(--accent-primary)';
              if (channel.includes('Gmail')) channelIconColor = '#ea4335';
              else if (channel.includes('Outlook')) channelIconColor = '#0078d4';

              return (
                <div key={channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: channelIconColor }}></div>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>{channel}</span>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '700' }}>{count} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '400' }}>({pct}%)</span></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Candidate Seniority Distribution */}
        <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--accent-secondary)' }} />
            Talent Seniority Segments
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', alignItems: 'end', height: '140px', paddingBottom: '10px' }}>
            {Object.entries(seniorityCounts).map(([level, count]) => {
              const maxCount = Math.max(...Object.values(seniorityCounts)) || 1;
              const barHeight = Math.max(15, (count / maxCount) * 100);
              return (
                <div key={level} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>{count}</span>
                  <div style={{ 
                    width: '100%', 
                    height: `${barHeight}%`, 
                    background: 'var(--accent-gradient)', 
                    borderRadius: '4px 4px 0 0',
                    boxShadow: '0 0 10px rgba(99, 102, 241, 0.2)' 
                  }}></div>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }} title={level}>
                    {level}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
