import React, { useState, useEffect } from 'react';
import { RefreshCw, ClipboardList, CheckCircle2, AlertCircle, Loader, Eye, X, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { exportToCSV } from '../utils/export';
import { matchDateRangeHelper } from '../utils/dateFilters';

export default function IngestionTracker({ backendUrl, isActive }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filterDateRange, setFilterDateRange] = useState('');

  const filteredLogs = logs.filter(log => {
    const logDate = log.timestamp ? new Date(log.timestamp) : null;
    return matchDateRangeHelper(logDate, filterDateRange);
  });

  useEffect(() => {
    fetchLogs();
    
    // Poll logs every 8 seconds for real-time status updates while screen is active
    const pollInterval = setInterval(() => {
      if (!isActive || document.hidden) return;
      fetchLogs(true);
    }, 8000);
    
    return () => clearInterval(pollInterval);
  }, [isActive]);

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/ingestion-logs`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error('Failed to fetch ingestion logs', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleExport = () => {
    const headers = {
      fileName: 'File Name',
      source: 'Source Channel',
      status: 'Status',
      error: 'Error / Failure Details',
      candidateName: 'Linked Candidate Name',
      timestamp: 'Log Timestamp'
    };
    
    const dataToExport = filteredLogs.map(l => ({
      ...l,
      timestamp: new Date(l.timestamp).toLocaleString(),
      candidateName: l.candidateName || 'N/A'
    }));

    exportToCSV(dataToExport, 'resume_ingestion_log', headers);
  };

  const formatSource = (src) => {
    if (src === 'manual') return 'Manual Upload';
    if (src === 'gmail') return 'Gmail Sourcing';
    if (src === 'outlook') return 'Outlook Sourcing';
    return src;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
      {/* Top Controls panel */}
      <div className="glass" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'white', display: 'flex' }}>
            <ClipboardList size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Resume Ingestion & Processing Logs</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Track the real-time pipeline status of all manually uploaded files and automated email candidate fetches.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            className="form-input" 
            style={{ width: '150px', padding: '6px 12px', fontSize: '13px', minHeight: '36px' }}
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value)}
          >
            <option value="">All Time</option>
            <option value="last-24h">Last 24 Hours</option>
            <option value="last-1w">Within 1 Week</option>
            <option value="last-2w">Within 2 Weeks</option>
            <option value="last-1m">Within 1 Month</option>
            <option value="last-3m">Within 3 Months</option>
            <option value="last-6m">Within 6 Months</option>
            <option value="last-1y">Within 1 Year</option>
            <option value="before-1w">Before 1 Week</option>
            <option value="before-2w">Before 2 Weeks</option>
            <option value="before-1m">Before 1 Month</option>
            <option value="before-3m">Before 3 Months</option>
            <option value="before-6m">Before 6 Months</option>
            <option value="before-1y">Before 1 Year</option>
          </select>
          {logs.length > 0 && (
            <button 
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}
              onClick={handleExport}
            >
              <FileSpreadsheet size={14} /> Export Log to Excel
            </button>
          )}
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}
            onClick={() => fetchLogs()} 
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ animation: loading ? 'spin 1.5s linear infinite' : 'none' }} /> 
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Main logs Table */}
      <div className="glass" style={{ flexGrow: 1, padding: '24px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
          {loading && logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading ingestion pipeline log...</div>
          ) : logs.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%', 
              color: 'var(--text-secondary)', 
              gap: '16px',
              padding: '40px'
            }}>
              <ClipboardList size={48} style={{ opacity: 0.3 }} />
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontSize: '15px' }}>No logs recorded yet</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Upload a resume in the Pipeline Board or trigger email sourcing to see history.
                </p>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%', 
              color: 'var(--text-secondary)', 
              gap: '16px',
              padding: '40px'
            }}>
              <ClipboardList size={48} style={{ opacity: 0.3 }} />
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontSize: '15px' }}>No matching logs</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  No logs found matching the selected timeframe. Try clearing or changing the filter.
                </p>
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  <th style={{ padding: '12px 16px' }}>Resume File</th>
                  <th style={{ padding: '12px 16px' }}>Source Channel</th>
                  <th style={{ padding: '12px 16px' }}>Import Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>Linked Candidate</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const statusColors = 
                    log.status === 'success' ? { bg: 'rgba(16, 185, 129, 0.1)', text: 'var(--status-offered)', border: 'rgba(16, 185, 129, 0.2)' } :
                    log.status === 'failed' ? { bg: 'rgba(239, 68, 68, 0.1)', text: 'var(--status-rejected)', border: 'rgba(239, 68, 68, 0.2)' } :
                    log.status === 'duplicate' ? { bg: 'rgba(245, 158, 11, 0.1)', text: '#d97706', border: 'rgba(245, 158, 11, 0.2)' } :
                    log.status === 'cancelled' ? { bg: 'rgba(156, 163, 175, 0.1)', text: 'var(--text-secondary)', border: 'rgba(156, 163, 175, 0.2)' } :
                    { bg: 'rgba(59, 130, 246, 0.1)', text: 'var(--accent-primary)', border: 'rgba(59, 130, 246, 0.2)' };

                  return (
                    <tr 
                      key={log.id} 
                      style={{ borderBottom: '1px solid var(--glass-border)', background: selectedLog?.id === log.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent', transition: 'background-color 0.2s' }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: '500', color: 'var(--text-primary)' }}>{log.fileName}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{formatSource(log.source)}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: log.candidateName ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {log.candidateName || 'N/A'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '4px 10px', 
                          borderRadius: '12px', 
                          fontSize: '11px',
                          fontWeight: '600',
                          background: statusColors.bg,
                          color: statusColors.text,
                          border: `1px solid ${statusColors.border}`
                        }}>
                          {log.status === 'success' && <CheckCircle2 size={12} />}
                          {log.status === 'failed' && <AlertCircle size={12} />}
                          {log.status === 'duplicate' && <AlertCircle size={12} style={{ color: '#d97706' }} />}
                          {log.status === 'cancelled' && <X size={12} />}
                          {log.status === 'processing' && <Loader className="animate-spin" size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                          {log.status === 'duplicate' ? 'ALREADY EXISTS' : log.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {log.status !== 'processing' && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '11px', minHeight: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye size={12} /> Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details Modal overlay */}
      {selectedLog && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(0,0,0,0.6)', 
          backdropFilter: 'blur(4px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000 
        }}>
          <div className="glass" style={{ 
            width: '600px', 
            maxHeight: '80vh', 
            borderRadius: 'var(--radius-lg)', 
            display: 'flex', 
            flexDirection: 'column', 
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} style={{ color: 'var(--accent-primary)' }} />
                <h4 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Processing Details</h4>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>File Info</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{selectedLog.fileName}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Sourcing Channel</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{formatSource(selectedLog.source)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Timestamp</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{new Date(selectedLog.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Status</span>
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  padding: '3px 8px', 
                  borderRadius: '10px', 
                  fontSize: '11px', 
                  fontWeight: '600',
                  background: 
                    selectedLog.status === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                    selectedLog.status === 'failed' ? 'rgba(239, 68, 68, 0.1)' :
                    selectedLog.status === 'duplicate' ? 'rgba(245, 158, 11, 0.1)' :
                    selectedLog.status === 'cancelled' ? 'rgba(156, 163, 175, 0.1)' :
                    'rgba(59, 130, 246, 0.1)',
                  color: 
                    selectedLog.status === 'success' ? 'var(--status-offered)' :
                    selectedLog.status === 'failed' ? 'var(--status-rejected)' :
                    selectedLog.status === 'duplicate' ? '#d97706' :
                    selectedLog.status === 'cancelled' ? 'var(--text-secondary)' :
                    'var(--accent-primary)'
                }}>
                  {selectedLog.status === 'success' && <CheckCircle2 size={12} />}
                  {selectedLog.status === 'failed' && <AlertCircle size={12} />}
                  {selectedLog.status === 'duplicate' && <AlertCircle size={12} style={{ color: '#d97706' }} />}
                  {selectedLog.status === 'cancelled' && <X size={12} />}
                  {selectedLog.status === 'processing' && <Loader className="animate-spin" size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                  {selectedLog.status === 'duplicate' ? 'ALREADY EXISTS' : selectedLog.status.toUpperCase()}
                </span>
              </div>

              {(selectedLog.status === 'failed' || selectedLog.status === 'duplicate' || selectedLog.status === 'cancelled') && selectedLog.error && (
                <div style={{ 
                  background: 
                    selectedLog.status === 'duplicate' ? 'rgba(245, 158, 11, 0.05)' : 
                    selectedLog.status === 'failed' ? 'rgba(239, 68, 68, 0.05)' : 
                    'rgba(156, 163, 175, 0.05)', 
                  border: `1px solid ${
                    selectedLog.status === 'duplicate' ? 'rgba(245, 158, 11, 0.2)' : 
                    selectedLog.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 
                    'rgba(156, 163, 175, 0.2)'
                  }`, 
                  padding: '16px', 
                  borderRadius: 'var(--radius-md)' 
                }}>
                  <span style={{ 
                    color: 
                      selectedLog.status === 'duplicate' ? '#d97706' : 
                      selectedLog.status === 'failed' ? 'var(--status-rejected)' : 
                      'var(--text-secondary)', 
                    display: 'block', 
                    fontSize: '11px', 
                    textTransform: 'uppercase', 
                    fontWeight: '700', 
                    marginBottom: '6px' 
                  }}>
                    {selectedLog.status === 'duplicate' ? 'Duplicate Warning' : selectedLog.status === 'failed' ? 'Error Message' : 'Reason / Info'}
                  </span>
                  <p style={{ margin: 0, fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{selectedLog.error}</p>
                </div>
              )}

              {selectedLog.status === 'success' && selectedLog.extractedData && (
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Extracted Profile Data</span>
                    <span style={{ color: 'var(--status-offered)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Linked: {selectedLog.candidateName}
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                    <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)' }}>
                      {JSON.stringify(selectedLog.extractedData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.1)' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '8px 16px', fontSize: '13px' }}
                onClick={() => setSelectedLog(null)}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
