import React, { useState, useEffect } from 'react';
import { X, Send, CheckCircle2, AlertCircle, Loader, Mail } from 'lucide-react';

export default function EmailModal({ candidate, job, templates, onClose, onEmailSent, backendUrl }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (candidate && job) {
      // Determine template key based on current stage
      let templateKey = 'interview';
      if (candidate.stage.toLowerCase() === 'offered') templateKey = 'offer';
      if (candidate.stage.toLowerCase() === 'rejected') templateKey = 'reject';

      const rawTemplate = templates?.[templateKey] || '';
      
      // Parse template placeholders
      const companyName = 'Your Company';
      let parsedSubject = `Application Status Update - ${companyName}`;
      let parsedBody = rawTemplate;

      if (rawTemplate.startsWith('Subject:')) {
        const parts = rawTemplate.split('\n');
        parsedSubject = parts[0].replace('Subject:', '').trim();
        parsedBody = parts.slice(1).join('\n').trim();
      }

      const replacePlaceholders = (text) => {
        return text
          .replace(/{candidate_name}/g, candidate.name)
          .replace(/{job_title}/g, job.title)
          .replace(/{company_name}/g, companyName);
      };

      setSubject(replacePlaceholders(parsedSubject));
      setBody(replacePlaceholders(parsedBody));
    }
  }, [candidate, job, templates]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      alert('Email subject and body cannot be empty.');
      return;
    }

    try {
      setSending(true);
      setError('');
      
      const res = await fetch(`${backendUrl}/api/candidates/${candidate.id}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subject, body })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to send email.');
      }

      setSuccess(true);
      setTimeout(() => {
        onEmailSent(candidate.id);
        onClose();
      }, 1500);
    } catch (e) {
      console.error('Email send error:', e);
      setError(e.message || 'Gmail API failed to send the email.');
    } finally {
      setSending(false);
    }
  };

  if (!candidate) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.75)', zIndex: 110, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass" style={{ width: '100%', maxWidth: '600px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={18} style={{ color: 'var(--accent-primary)' }} /> Send Recruitment Letter
          </h3>
          <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={onClose} disabled={sending}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        {success ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--status-offered)' }} />
            <h3 style={{ fontSize: '20px' }}>Email Sent Successfully</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              The email has been queued and sent using your authorized Gmail account.
            </p>
          </div>
        ) : (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {error && (
              <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--status-rejected)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Recipient:</span>
              <div style={{ fontWeight: '600', fontSize: '14px', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {candidate.name} <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>({candidate.email})</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Subject Line</label>
              <input 
                type="text" 
                className="form-input" 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)} 
                disabled={sending}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email Body (Plain Text)</label>
              <textarea 
                className="form-input" 
                rows={10} 
                style={{ resize: 'vertical', minHeight: '180px', lineHeight: '1.6' }}
                value={body} 
                onChange={(e) => setBody(e.target.value)} 
                disabled={sending}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button className="btn btn-secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
                {sending ? (
                  <>
                    <Loader size={14} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} /> Sending...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Send Letter
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
