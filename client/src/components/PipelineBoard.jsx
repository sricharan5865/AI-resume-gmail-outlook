import React, { useState } from 'react';
import { Briefcase, MapPin, Sparkles, Eye, Mail, Upload, FileText, Plus, Loader, Filter, Trash2, Search, AlertCircle, X, FileSpreadsheet, Calendar } from 'lucide-react';
import { exportToCSV } from '../utils/export';
import { getCandidateDate, matchDateRangeHelper } from '../utils/dateFilters';


const STAGES = ['Inbox', 'Shortlist', 'Interview', 'Offered', 'Rejected'];

export default function PipelineBoard({ 
  candidates, 
  jobs, 
  onStageChanged, 
  onSelectCandidate, 
  onOpenEmailModal,
  onManualUpload,
  onCandidateDeleted,
  backendUrl,
  rankAccordingToJob
}) {
  const [selectedFilterJobId, setSelectedFilterJobId] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [draggedCandidateId, setDraggedCandidateId] = useState(null);
  const [activeDragStage, setActiveDragStage] = useState(null);
  const [duplicatesQueue, setDuplicatesQueue] = useState([]);
  const [filterDateRange, setFilterDateRange] = useState('');

  const handleExport = () => {
    const headers = {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      linkedinUrl: 'LinkedIn URL',
      jobId: 'Job Position',
      stage: 'Current Stage',
      matchScore: 'Job Match Score',
      ownCategoryScore: 'Competency Score',
      skills: 'Skills',
      experience: 'Work Experience',
      education: 'Education',
      createdAt: 'Import Date'
    };
    
    const dataToExport = sortedCandidates.map(c => {
      const job = jobs.find(j => j.id === c.jobId);
      return {
        ...c,
        jobId: job ? job.title : 'General Role'
      };
    });
    
    const job = jobs.find(j => j.id === selectedFilterJobId);
    const fileName = job ? `candidates_${job.title.replace(/\s+/g, '_').toLowerCase()}` : 'all_candidates_pipeline';
    
    exportToCSV(dataToExport, fileName, headers);
  };

  // Sorting state
  const [sortBy, setSortBy] = useState('score-desc');

  // Inbox column search, filter & sort states
  const [inboxSearchTerm, setInboxSearchTerm] = useState('');
  const [inboxFilterDate, setInboxFilterDate] = useState('');
  const [inboxSortBy, setInboxSortBy] = useState('newest');

  // Helper to get active score based on ranking mode
  const getCandidateScore = (c) => {
    return rankAccordingToJob ? c.matchScore : (c.ownCategoryScore ?? c.matchScore);
  };

  // Filter candidates by Job ID & Date
  const filteredCandidates = candidates.filter(c => {
    if (selectedFilterJobId && c.jobId !== selectedFilterJobId) return false;
    if (filterDateRange && !matchDateRangeHelper(getCandidateDate(c), filterDateRange)) return false;
    return true;
  });

  // Sort candidates by score or date of submission
  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    if (sortBy === 'score-desc') return getCandidateScore(b) - getCandidateScore(a);
    if (sortBy === 'score-asc') return getCandidateScore(a) - getCandidateScore(b);
    if (sortBy === 'date-desc') {
      const dateA = getCandidateDate(a);
      const dateB = getCandidateDate(b);
      return dateB - dateA;
    }
    if (sortBy === 'date-asc') {
      const dateA = getCandidateDate(a);
      const dateB = getCandidateDate(b);
      return dateA - dateB;
    }
    return 0;
  });

  const handleDeleteCandidateDirectly = async (candidateId, name) => {
    if (!window.confirm(`Are you sure you want to delete candidate "${name}"?`)) return;
    if (!window.confirm(`Are you absolutely sure? This will permanently delete candidate "${name}" from the system and cannot be undone.`)) return;
    try {
      const res = await fetch(`${backendUrl}/api/candidates/${candidateId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete candidate');
      }
      onCandidateDeleted(candidateId);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Error deleting candidate');
    }
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e, id) => {
    setDraggedCandidateId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragEnd = () => {
    setDraggedCandidateId(null);
    setActiveDragStage(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Required to allow dropping
  };

  const handleDrop = async (e, stage) => {
    e.preventDefault();
    const candidateId = e.dataTransfer.getData('text/plain') || draggedCandidateId;
    setActiveDragStage(null);
    if (!candidateId) return;

    const candidate = candidates.find(c => c.id === candidateId);
    const oldStage = candidate ? candidate.stage : null;

    try {
      // Optimistic state update in parent
      onStageChanged(candidateId, stage);
      
      // Update backend
      const res = await fetch(`${backendUrl}/api/candidates/${candidateId}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage })
      });

      if (!res.ok) {
        throw new Error('Server rejected stage update');
      }
    } catch (err) {
      console.error('Failed to update stage on backend:', err);
      if (oldStage) {
        onStageChanged(candidateId, oldStage);
        alert(`Failed to update candidate stage on server. Reverting to original stage.`);
      }
    } finally {
      setDraggedCandidateId(null);
    }
  };

  // Manual File Upload Handler
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    try {
      setUploadingFile(true);
      const successes = [];
      const failures = [];
      const localDuplicates = [];

      // Step 1: Pre-register all logs on backend
      setUploadProgress('Pre-registering upload queue...');
      let registeredLogs = [];
      try {
        const filesData = files.map(f => ({ fileName: f.name, source: 'manual' }));
        const preRegRes = await fetch(`${backendUrl}/api/ingestion-logs/pre-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filesData })
        });
        if (preRegRes.ok) {
          const preRegData = await preRegRes.json();
          registeredLogs = preRegData.logs || [];
        }
      } catch (preRegErr) {
        console.error('Pre-registration of ingestion logs failed:', preRegErr);
      }

      // Step 2: Loop & Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (files.length > 1) {
          setUploadProgress(`Uploading ${i + 1}/${files.length}...`);
        } else {
          setUploadProgress('Uploading...');
        }

        const matchingLog = registeredLogs[i];
        const logId = matchingLog ? matchingLog.id : null;

        try {
          const formData = new FormData();
          formData.append('resume', file);
          if (logId) {
            formData.append('logId', logId);
          }

          const res = await fetch(`${backendUrl}/api/candidates/upload`, {
            method: 'POST',
            body: formData
          });

          if (!res.ok) {
            let errMsg = 'Upload failed';
            try {
              const errData = await res.json();
              if (res.status === 409 && errData.duplicate) {
                localDuplicates.push({
                  candidate: errData.candidate,
                  tempFile: errData.tempFile,
                  parsedData: errData.parsedData,
                  pdfText: errData.pdfText,
                  jobId: errData.jobId,
                  fileName: file.name,
                  fileObject: file,
                  logId: errData.logId || logId
                });
                continue;
              }
              errMsg = errData.error || errMsg;
            } catch (jsonErr) {}
            throw new Error(errMsg);
          }

          const newCandidate = await res.json();
          if (newCandidate && newCandidate.id) {
            window.localResumeUrls = window.localResumeUrls || {};
            window.localResumeUrls[newCandidate.id] = URL.createObjectURL(file);
          }
          onManualUpload(newCandidate);
          successes.push(file.name);
        } catch (err) {
          console.error('File upload error for:', file.name, err);
          failures.push(`${file.name}: ${err.message}`);
        }
      }

      // Set state for user resolution
      if (localDuplicates.length > 0) {
        setDuplicatesQueue(localDuplicates);
        alert(`Upload loop completed.\n\nSuccessfully processed: ${successes.length} resume(s).\nDuplicates detected: ${localDuplicates.length} resume(s) (Please resolve them in the next prompts).\nFailed: ${failures.length} resume(s).\n\n${failures.length > 0 ? `Errors:\n${failures.join('\n')}` : ''}`);
      } else if (failures.length > 0) {
        alert(`Upload complete!\nSuccessfully processed: ${successes.length} resume(s).\nFailed: ${failures.length} resume(s).\n\nErrors:\n${failures.join('\n')}`);
      } else {
        alert(`Successfully uploaded and parsed ${successes.length} resume(s)!`);
      }
    } catch (err) {
      console.error('General upload error:', err);
      alert('An unexpected error occurred during upload.');
    } finally {
      setUploadingFile(false);
      setUploadProgress('');
      setUploadJobId('');
      // Clear input
      e.target.value = null;
    }
  };

  const handleResolveDuplicate = async (action) => {
    if (duplicatesQueue.length === 0) return;
    const currentDuplicate = duplicatesQueue[0];
    
    try {
      setUploadingFile(true);
      setUploadProgress('Resolving duplicate...');
      const res = await fetch(`${backendUrl}/api/candidates/upload/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          candidateId: currentDuplicate.candidate.id,
          tempFile: currentDuplicate.tempFile,
          parsedData: currentDuplicate.parsedData,
          pdfText: currentDuplicate.pdfText,
          jobId: currentDuplicate.jobId,
          logId: currentDuplicate.logId
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to resolve duplicate');
      }

      const data = await res.json();
      if (action === 'update') {
        if (data && data.id && currentDuplicate.fileObject) {
          window.localResumeUrls = window.localResumeUrls || {};
          window.localResumeUrls[data.id] = URL.createObjectURL(currentDuplicate.fileObject);
        }
        onManualUpload(data, true);
      } else if (action === 'remove') {
        onCandidateDeleted(currentDuplicate.candidate.id);
      } else if (action === 'delete-before') {
        if (data && data.id && currentDuplicate.fileObject) {
          window.localResumeUrls = window.localResumeUrls || {};
          window.localResumeUrls[data.id] = URL.createObjectURL(currentDuplicate.fileObject);
        }
        onCandidateDeleted(currentDuplicate.candidate.id);
        onManualUpload(data);
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error resolving duplicate');
    } finally {
      setUploadingFile(false);
      setUploadProgress('');
      setDuplicatesQueue(prev => prev.slice(1));
    }
  };

  const duplicateInfo = duplicatesQueue[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden' }}>
      
      {/* Filters & Manual Sourcing Panel */}
      <div className="glass" style={{ padding: '16px 24px', borderRadius: 'var(--radius-lg)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        
        {/* Job Filter & Sorting Panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={16} /> Filter Job:
            </span>
            <select 
              className="form-input" 
              style={{ width: '200px', padding: '6px 12px', fontSize: '13px' }}
              value={selectedFilterJobId}
              onChange={(e) => setSelectedFilterJobId(e.target.value)}
            >
              <option value="">All Job Positions</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} /> Date Filter:
            </span>
            <select 
              className="form-input" 
              style={{ width: '165px', padding: '6px 12px', fontSize: '13px' }}
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Sort:
            </span>
            <select 
              className="form-input" 
              style={{ width: '160px', padding: '6px 12px', fontSize: '13px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="score-desc">Score: High to Low</option>
              <option value="score-asc">Score: Low to High</option>
              <option value="date-desc">Date: Newest First</option>
              <option value="date-asc">Date: Oldest First</option>
            </select>
          </div>

          {sortedCandidates.length > 0 && (
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}
              onClick={handleExport}
              title="Export filtered candidates list to Excel"
            >
              <FileSpreadsheet size={14} /> Export to Excel
            </button>
          )}
        </div>

        {/* Upload Resume Direct Portal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Manual Import:
          </span>
          
          <label 
            className="btn btn-secondary"
            style={{ 
              padding: '6px 14px', 
              fontSize: '12px', 
              cursor: uploadingFile ? 'not-allowed' : 'pointer',
              opacity: uploadingFile ? 0.5 : 1
            }}
          >
            {uploadingFile ? (
              <>
                <Loader size={12} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                <span style={{ marginLeft: '6px' }}>{uploadProgress || 'Uploading...'}</span>
              </>
            ) : (
              <>
                <Upload size={12} />
                <span style={{ marginLeft: '6px' }}>Upload Resume PDF(s)</span>
              </>
            )}
            {!uploadingFile && (
              <input 
                type="file" 
                accept=".pdf" 
                multiple
                style={{ display: 'none' }} 
                onChange={handleFileUpload} 
              />
            )}
          </label>
        </div>
      </div>

      {/* Kanban Scroll View */}
      <div style={{ flexGrow: 1, overflow: 'hidden' }}>
        <div className="kanban-board">
          {STAGES.map(stage => {
            const originalStageCandidates = sortedCandidates.filter(
              c => c.stage.toLowerCase() === stage.toLowerCase()
            );

            let stageCandidates = [...originalStageCandidates];

            if (stage === 'Inbox') {
              // 1. Text Search Filter (name, skills, company name, education institution)
              if (inboxSearchTerm.trim()) {
                const term = inboxSearchTerm.toLowerCase();
                stageCandidates = stageCandidates.filter(c => {
                  const nameMatch = (c.name || '').toLowerCase().includes(term);
                  const skillsMatch = (c.skills || []).some(s => s.toLowerCase().includes(term));
                  
                  // Check experience roles/companies
                  const expMatch = (c.experience || []).some(exp => 
                    (exp.role || '').toLowerCase().includes(term) ||
                    (exp.company || '').toLowerCase().includes(term)
                  );
                  
                  // Check education
                  const eduMatch = (c.education || []).some(edu =>
                    (edu.degree || '').toLowerCase().includes(term) ||
                    (edu.institution || '').toLowerCase().includes(term)
                  );

                  // Check date format match
                  const createdAtDate = new Date(c.createdAt);
                  const dateStr = createdAtDate.toLocaleDateString().toLowerCase();
                  const dateLongStr = createdAtDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase();
                  const dateMatch = dateStr.includes(term) || dateLongStr.includes(term);

                  return nameMatch || skillsMatch || expMatch || eduMatch || dateMatch;
                });
              }

              // 2. Specific Date of Receipt Filter (createdAt)
              if (inboxFilterDate) {
                const filterDateObj = new Date(inboxFilterDate);
                stageCandidates = stageCandidates.filter(c => {
                  if (!c.createdAt) return false;
                  const createdAtDate = new Date(c.createdAt);
                  return createdAtDate.getFullYear() === filterDateObj.getFullYear() &&
                         createdAtDate.getMonth() === filterDateObj.getMonth() &&
                         createdAtDate.getDate() === filterDateObj.getDate();
                });
              }

              // 3. Sort logic
              stageCandidates = [...stageCandidates].sort((a, b) => {
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                if (inboxSortBy === 'newest') return dateB - dateA;
                if (inboxSortBy === 'oldest') return dateA - dateB;
                if (inboxSortBy === 'score-desc') return getCandidateScore(b) - getCandidateScore(a);
                if (inboxSortBy === 'score-asc') return getCandidateScore(a) - getCandidateScore(b);
                return 0;
              });
            }

            // Set column border classes
            let headerColor = 'var(--text-primary)';
            if (stage === 'Inbox') headerColor = 'var(--status-inbox)';
            if (stage === 'Shortlist') headerColor = 'var(--status-shortlist)';
            if (stage === 'Interview') headerColor = 'var(--status-interview)';
            if (stage === 'Offered') headerColor = 'var(--status-offered)';
            if (stage === 'Rejected') headerColor = 'var(--status-rejected)';

            return (
              <div 
                key={stage} 
                className={`kanban-column ${activeDragStage === stage ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragEnter={() => setActiveDragStage(stage)}
                onDragLeave={() => setActiveDragStage(null)}
                onDrop={(e) => handleDrop(e, stage)}
                style={{ transition: 'all 0.2s ease' }}
              >
                {/* Column Header */}
                <div className="kanban-column-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: headerColor }}>
                    {stage}
                    <span style={{ fontSize: '12px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '10px' }}>
                      {stageCandidates.length}
                    </span>
                  </span>
                </div>

                {/* Search and Sort Sub-bar for Inbox Stage */}
                {stage === 'Inbox' && (
                  <div style={{ 
                    padding: '8px 4px 12px 4px', 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    borderBottom: '1px solid var(--glass-border)',
                    marginBottom: '12px'
                  }}>
                    {/* Search Input */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={12} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                      <input 
                        type="text" 
                        placeholder="Search name, skills..." 
                        value={inboxSearchTerm}
                        onChange={(e) => setInboxSearchTerm(e.target.value)}
                        className="form-input"
                        style={{ 
                          paddingLeft: '26px', 
                          width: '100%',
                          fontSize: '11px',
                          height: '28px',
                          borderRadius: 'var(--radius-sm)'
                        }}
                      />
                    </div>
                    
                    {/* Date Selector & Sort Dropdown */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexGrow: 1 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Date:</span>
                        <input 
                          type="date" 
                          value={inboxFilterDate}
                          onChange={(e) => setInboxFilterDate(e.target.value)}
                          className="form-input"
                          style={{ 
                            fontSize: '10px',
                            height: '26px',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            flexGrow: 1,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)'
                          }}
                        />
                        {inboxFilterDate && (
                          <button 
                            onClick={() => setInboxFilterDate('')}
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: 'var(--text-muted)', 
                              cursor: 'pointer', 
                              fontSize: '9px',
                              padding: '0 2px',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseOver={(e) => e.target.style.color = 'var(--status-rejected)'}
                            onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Sort:</span>
                        <select 
                          value={inboxSortBy} 
                          onChange={(e) => setInboxSortBy(e.target.value)}
                          className="form-input"
                          style={{ 
                            width: '80px', 
                            fontSize: '10px',
                            height: '26px',
                            borderRadius: '4px',
                            padding: '0 2px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <option value="newest">Newest</option>
                          <option value="oldest">Oldest</option>
                          <option value="score-desc">Score ↑</option>
                          <option value="score-asc">Score ↓</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cards Container */}
                <div className="kanban-cards-container">
                  {stageCandidates.length === 0 ? (
                    <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {originalStageCandidates.length > 0 ? 'No matching candidates' : 'Drag candidates here'}
                    </div>
                  ) : (
                    stageCandidates.map(candidate => {
                      const job = jobs.find(j => j.id === candidate.jobId);
                      const score = getCandidateScore(candidate);
                      const scoreColorClass = score >= 80 ? 'score-high' : score >= 50 ? 'score-medium' : 'score-low';

                      return (
                        <div 
                          key={candidate.id}
                          className="glass candidate-card"
                          style={{
                            borderLeft: `4px solid ${headerColor}`,
                            background: draggedCandidateId === candidate.id ? 'rgba(255,255,255,0.02)' : 'var(--glass-bg)',
                            opacity: draggedCandidateId === candidate.id ? 0.4 : 1,
                            transition: 'transform 0.2s, box-shadow 0.2s, opacity 0.2s'
                          }}
                          draggable
                          onDragStart={(e) => handleDragStart(e, candidate.id)}
                          onDragEnd={handleDragEnd}
                        >
                          {/* Top Row: Score & Name */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '2px', color: 'var(--text-primary)' }}>{candidate.name}</h4>
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Briefcase size={10} /> {job ? job.title : 'General'}
                              </p>
                            </div>
                            
                            <div className={`score-badge ${scoreColorClass}`} style={{ width: '32px', height: '32px', fontSize: '11px', flexShrink: 0 }}>
                              {score}
                            </div>
                          </div>

                          {/* Skill Badges (Top 3) */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }}>
                            {candidate.skills.slice(0, 3).map((skill, index) => (
                              <span 
                                key={index} 
                                style={{ 
                                  fontSize: '10px', 
                                  background: 'var(--bg-tertiary)', 
                                  color: 'var(--text-secondary)', 
                                  padding: '3px 8px', 
                                  borderRadius: '12px',
                                  border: '1px solid var(--glass-border)',
                                  fontWeight: '500'
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                            {candidate.skills.length > 3 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '2px 4px' }}>
                                +{candidate.skills.length - 3}
                              </span>
                            )}
                          </div>

                          {/* AI Tags (Top 3) */}
                          {candidate.tags && candidate.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }}>
                              {candidate.tags.slice(0, 3).map((tag, index) => {
                                // Simple category to class mapping
                                const catLower = (tag.category || '').toLowerCase();
                                let catClass = 'tag-default';
                                if (catLower.includes('seniority')) catClass = 'tag-seniority';
                                else if (catLower.includes('domain') || catLower.includes('role')) catClass = 'tag-domain';
                                else if (catLower.includes('stack') || catLower.includes('tech')) catClass = 'tag-tech';
                                else if (catLower.includes('experience')) catClass = 'tag-experience';

                                return (
                                  <span 
                                    key={index} 
                                    className={`tag-badge ${catClass}`}
                                    style={{ 
                                      fontSize: '9px', 
                                      padding: '2px 6px'
                                    }}
                                  >
                                    {tag.value}
                                  </span>
                                );
                              })}
                              {candidate.tags.length > 3 && (
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)', padding: '2px 4px' }}>
                                  +{candidate.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action footer */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                            <a 
                              href={candidate.resumeUrl ? `${backendUrl}${candidate.resumeUrl}` : '#'} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none' }}
                            >
                              <FileText size={10} /> CV.pdf
                            </a>
                            
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '10px' }}
                                onClick={() => onSelectCandidate(candidate)}
                              >
                                <Eye size={12} /> View
                              </button>
                              
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '4px 8px', fontSize: '10px' }}
                                onClick={() => onOpenEmailModal(candidate)}
                              >
                                <Mail size={12} /> Contact
                              </button>

                              <button 
                                className="btn btn-danger" 
                                style={{ padding: '4px 8px', fontSize: '10px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCandidateDirectly(candidate.id, candidate.name);
                                }}
                                title="Delete Candidate"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duplicate Candidate Modal Overlay */}
      {duplicateInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.75)', zIndex: 110, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass" style={{ width: '100%', maxWidth: '500px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24' }}>
                <AlertCircle size={18} /> Duplicate Candidate Detected
              </h3>
              <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => handleResolveDuplicate('cancel')}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
                Candidate <strong>{duplicateInfo.candidate.name}</strong> ({duplicateInfo.candidate.email || 'no email'}) already exists in the recruitment pipeline.
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                What action would you like to perform for the manually uploaded file <strong>{duplicateInfo.fileName}</strong>?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ justifyContent: 'center', padding: '12px', fontWeight: '600' }} 
                  onClick={() => handleResolveDuplicate('update')}
                >
                  Update (Overwrite Existing Info & CV)
                </button>
                <button 
                  className="btn" 
                  style={{ justifyContent: 'center', padding: '12px', fontWeight: '600', backgroundColor: '#d97706', color: '#ffffff' }} 
                  onClick={() => handleResolveDuplicate('delete-before')}
                >
                  Delete Existing & Import New
                </button>
                <button 
                  className="btn btn-danger" 
                  style={{ justifyContent: 'center', padding: '12px', fontWeight: '600' }} 
                  onClick={() => handleResolveDuplicate('remove')}
                >
                  Delete Existing Only (Halt Import)
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ justifyContent: 'center', padding: '12px', fontWeight: '600' }} 
                  onClick={() => handleResolveDuplicate('cancel')}
                >
                  Cancel (Discard Uploaded File)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
