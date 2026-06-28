import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Sparkles, Send, User, Briefcase, GraduationCap, Tag, Clock,
  ChevronRight, ChevronDown, Zap, Brain, RotateCcw, Mail, Eye, Loader2,
  Database, MessageSquare, ArrowRight, X
} from 'lucide-react';

const HISTORY_KEY = 'rag_search_history';
const MAX_HISTORY = 10;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function pushHistory(query) {
  const prev = getHistory().filter(q => q !== query);
  const next = [query, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  return [];
}

export default function RAGSearch({ candidates, onViewCandidate, onEmailCandidate, showToast, BACKEND_URL }) {
  const [mode, setMode] = useState('search'); // 'search' | 'ask'
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // search results array
  const [aiAnswer, setAiAnswer] = useState(null); // { answer, sources }
  const [queryTime, setQueryTime] = useState(null);
  const [error, setError] = useState(null);

  // RAG status
  const [ragStatus, setRagStatus] = useState(null);
  const [reindexing, setReindexing] = useState(false);

  // Search history
  const [history, setHistory] = useState(getHistory);
  const [inputFocused, setInputFocused] = useState(false);

  // Expanded matched sections per result
  const [expandedSections, setExpandedSections] = useState({});

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const [tagCloud, setTagCloud] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch RAG status and tag cloud on mount
  useEffect(() => {
    fetchStatus();
    fetchTagCloud();
  }, []);

  const fetchTagCloud = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/search/tag-cloud`);
      if (res.ok) {
        const data = await res.json();
        setTagCloud(data.cloud || []);
      }
    } catch (err) {
      console.error('Failed to fetch tag cloud:', err);
    }
  };

  const fetchSuggestions = async (prefix) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/search/suggestions?prefix=${encodeURIComponent(prefix)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setSuggestions([]);
    setShowSuggestions(false);
    executeSearch(suggestion);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rag/status`);
      if (res.ok) {
        const data = await res.json();
        setRagStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch RAG status:', err);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rag/reindex`, { method: 'POST' });
      if (res.ok) {
        showToast('Reindexing started successfully!', 'success');
        // Poll status after a short delay
        setTimeout(fetchStatus, 2000);
      } else {
        showToast('Failed to start reindexing.', 'error');
      }
    } catch (err) {
      showToast('Reindex request failed.', 'error');
    } finally {
      setReindexing(false);
    }
  };

  const executeSearch = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setAiAnswer(null);
    setShowSuggestions(false);
    const startTime = Date.now();

    try {
      if (mode === 'search') {
        const res = await fetch(`${BACKEND_URL}/api/rag/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, topK: 10 })
        });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = await res.json();
        setResults(data.results || data || []);
        setQueryTime(Date.now() - startTime);
      } else {
        const res = await fetch(`${BACKEND_URL}/api/rag/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, topK: 5 })
        });
        if (!res.ok) throw new Error(`Ask AI failed (${res.status})`);
        const data = await res.json();
        setAiAnswer({ answer: data.answer || data.response || '', sources: data.sources || data.candidates || [] });
        setQueryTime(Date.now() - startTime);
      }
      setHistory(pushHistory(searchQuery));
    } catch (err) {
      console.error('RAG error:', err);
      setError(err.message || 'Something went wrong');
      showToast(err.message || 'Search failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [mode, BACKEND_URL, showToast]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    executeSearch(query);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setShowSuggestions(false);
      handleSubmit();
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    // Fetch tag suggestions if typing length >= 2
    if (val.trim().length >= 2) {
      fetchSuggestions(val.trim());
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    // Auto-submit debounce in Ask AI mode only
    if (mode === 'ask' && val.trim().length > 3) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        executeSearch(val);
      }, 400);
    }
  };

  const handleHistoryClick = (q) => {
    setQuery(q);
    setInputFocused(false);
    setTimeout(() => executeSearch(q), 50);
  };

  const handleClearHistory = () => {
    setHistory(clearHistory());
  };

  const toggleSection = (resultIdx, sectionIdx) => {
    const key = `${resultIdx}-${sectionIdx}`;
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getScoreColor = (score) => {
    if (score >= 0.7) return 'rag-score-high';
    if (score >= 0.4) return 'rag-score-medium';
    return 'rag-score-low';
  };

  const formatAnswer = (text) => {
    if (!text) return '';
    
    // 1. Sanitize simple HTML tags to avoid broken markup, keeping basic inline formatting if any
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Bold tags: **bold** -> <strong>bold</strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 3. Headers: ### Title -> <h4>Title</h4>, ## Title -> <h3>Title</h3>
    formatted = formatted.replace(/^### (.*?)$/gm, '<h4 class="rag-answer-h4">$1</h4>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h3 class="rag-answer-h3">$1</h3>');

    // 4. Split into lines to identify and group lists
    const lines = formatted.split('\n');
    let insideList = false;
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match bullet points starting with *, -, or +
      const bulletMatch = line.match(/^[\*\-\+]\s+(.*)$/);
      // Match ordered list items starting with numbers: e.g. 1. Item
      const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);

      if (bulletMatch || orderedMatch) {
        if (!insideList) {
          insideList = true;
          processedLines.push('<ul class="rag-answer-list">');
        }
        const itemContent = bulletMatch ? bulletMatch[1] : orderedMatch[2];
        const prefix = orderedMatch ? `<strong class="rag-list-num">${orderedMatch[1]}.</strong> ` : '';
        processedLines.push(`<li class="rag-answer-li">${prefix}${itemContent}</li>`);
      } else {
        if (insideList) {
          insideList = false;
          processedLines.push('</ul>');
        }
        if (line) {
          processedLines.push(`<p class="rag-answer-p">${line}</p>`);
        }
      }
    }

    if (insideList) {
      processedLines.push('</ul>');
    }

    return processedLines.join('\n');
  };

  const showHistory = inputFocused && !query && history.length > 0;
  const hasSearched = results !== null || aiAnswer !== null;
  const showEmptyState = !hasSearched && !loading && !error;
  const showNoResults = hasSearched && !loading && mode === 'search' && results && results.length === 0;

  return (
    <div className="rag-container">
      {/* Header */}
      <div className="rag-header">
        <div className="rag-header-title">
          <div className="rag-header-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <h2>AI-Powered Resume Search</h2>
            <p>Search across all candidates using natural language queries</p>
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="rag-mode-toggle">
        <button
          className={`rag-mode-btn ${mode === 'search' ? 'rag-mode-active' : ''}`}
          onClick={() => { setMode('search'); setResults(null); setAiAnswer(null); setError(null); }}
        >
          <Search size={15} />
          <span>Search</span>
        </button>
        <button
          className={`rag-mode-btn ${mode === 'ask' ? 'rag-mode-active' : ''}`}
          onClick={() => { setMode('ask'); setResults(null); setAiAnswer(null); setError(null); }}
        >
          <Brain size={15} />
          <span>Ask AI</span>
        </button>
      </div>

      {/* Search Bar */}
      <form className="rag-search-bar" onSubmit={handleSubmit}>
        <div className={`rag-search-input-wrapper ${inputFocused ? 'rag-input-focused' : ''}`}>
          <Search size={18} className="rag-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="rag-search-input"
            placeholder={mode === 'search'
              ? 'Search candidates by skills, experience, qualifications...'
              : 'Ask anything about your candidates...'
            }
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => { setInputFocused(false); setShowSuggestions(false); }, 200)}
            autoComplete="off"
          />
          <button
            type="submit"
            className="rag-search-btn"
            disabled={!query.trim() || loading}
          >
            {loading ? <Loader2 size={18} className="rag-spin" /> : <ArrowRight size={18} />}
          </button>

          {/* Tag Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div 
              style={{ 
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '8px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 50,
                maxHeight: '200px',
                overflowY: 'auto'
              }}
            >
              {suggestions.map((suggestion, idx) => (
                <div 
                  key={idx}
                  className="rag-suggestion-item"
                  onMouseDown={() => handleSuggestionClick(suggestion)}
                >
                  <Tag size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* Search History */}
      {showHistory && (
        <div className="rag-history">
          <div className="rag-history-header">
            <Clock size={13} />
            <span>Recent Searches</span>
            <button className="rag-history-clear" onClick={handleClearHistory}>
              <X size={13} />
              Clear
            </button>
          </div>
          <div className="rag-history-chips">
            {history.map((h, i) => (
              <button key={i} className="rag-history-chip" onClick={() => handleHistoryClick(h)}>
                <Clock size={11} />
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="rag-content">
        {/* Loading Skeletons */}
        {loading && mode === 'search' && (
          <div className="rag-results">
            {[1, 2, 3].map(i => (
              <div key={i} className="rag-skeleton">
                <div className="rag-skeleton-header">
                  <div className="rag-skeleton-avatar"></div>
                  <div className="rag-skeleton-lines">
                    <div className="rag-skeleton-line rag-skeleton-line-lg"></div>
                    <div className="rag-skeleton-line rag-skeleton-line-sm"></div>
                  </div>
                  <div className="rag-skeleton-badge"></div>
                </div>
                <div className="rag-skeleton-tags">
                  {[1, 2, 3, 4].map(j => (
                    <div key={j} className="rag-skeleton-tag"></div>
                  ))}
                </div>
                <div className="rag-skeleton-line rag-skeleton-line-full"></div>
              </div>
            ))}
          </div>
        )}

        {/* Loading — Ask AI */}
        {loading && mode === 'ask' && (
          <div className="rag-ai-loading">
            <Brain size={40} className="rag-brain-pulse" />
            <p>Analyzing candidates and generating insights...</p>
          </div>
        )}

        {/* Empty State */}
        {showEmptyState && (
          <div className="rag-empty-state">
            <div className="rag-empty-icon">
              <Sparkles size={48} />
            </div>
            <h3 className="rag-empty-title">AI-Powered Resume Search</h3>
            <p className="rag-empty-subtitle">
              Search across all candidates using natural language. Find the perfect match
              by skills, experience, education, or any criteria.
            </p>
            <div className="rag-empty-suggestions">
              <span className="rag-empty-label">Try searching for:</span>
              <div className="rag-empty-chips">
                {[
                  'React developers with 5+ years experience',
                  'Machine learning engineers',
                  'Senior full-stack developers',
                  'Candidates with AWS certifications'
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    className="rag-suggestion-chip"
                    onClick={() => { setQuery(suggestion); executeSearch(suggestion); }}
                  >
                    <Zap size={12} />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag Cloud for quick search */}
            {tagCloud && tagCloud.length > 0 && (
              <div className="rag-empty-suggestions" style={{ marginTop: '24px' }}>
                <span className="rag-empty-label">Or search by tags:</span>
                <div className="rag-empty-chips" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  {tagCloud.slice(0, 15).map((t, idx) => (
                    <button
                      key={idx}
                      className="rag-suggestion-chip"
                      onClick={() => { setQuery(t.value); executeSearch(t.value); }}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        background: 'rgba(99, 102, 241, 0.05)',
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Tag size={10} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      {t.value}
                      <span style={{ fontSize: '9px', opacity: 0.5 }}>
                        ({t.count})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rag-error-state">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => executeSearch(query)}>
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        )}

        {/* No Results */}
        {showNoResults && (
          <div className="rag-empty-state rag-no-results">
            <Search size={40} style={{ opacity: 0.3 }} />
            <h3>No matching candidates found</h3>
            <p>Try a different query or broaden your search terms.</p>
          </div>
        )}

        {/* Search Results */}
        {!loading && results && results.length > 0 && (
          <div className="rag-results">
            <div className="rag-results-header">
              <span className="rag-results-count">
                Found <strong>{results.length}</strong> candidate{results.length !== 1 ? 's' : ''}
              </span>
              {queryTime && (
                <span className="rag-results-time">
                  in {queryTime}ms
                </span>
              )}
            </div>

            {results.map((result, idx) => {
              const rawCandidate = result.candidate || result;
              const candidate = candidates.find(c => c.id === (rawCandidate.id || rawCandidate.candidateId)) || rawCandidate;
              const score = result.score ?? result.relevanceScore ?? 0;
              const matchedSections = result.matchedSections || result.matches || [];
              const skills = candidate.skills || candidate.tags?.filter(t => t.category === 'tech')?.map(t => t.value) || [];
              const name = candidate.name || 'Unknown Candidate';
              const email = candidate.email || '';
              const seniority = candidate.seniorityLevel || candidate.seniority || candidate.tags?.find(t => t.category === 'seniority')?.value || '';

              return (
                <div
                  key={candidate.id || idx}
                  className="rag-result-card"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="rag-result-top">
                    <div className="rag-result-info">
                      <div className="rag-result-avatar">
                        <User size={18} />
                      </div>
                      <div className="rag-result-meta">
                        <h4 className="rag-result-name">{name}</h4>
                        <div className="rag-result-details">
                          {email && (
                            <span className="rag-result-detail">
                              <Mail size={12} /> {email}
                            </span>
                          )}
                          {seniority && (
                            <span className="rag-result-detail">
                              <Briefcase size={12} /> {seniority}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`rag-score-badge ${getScoreColor(score)}`}>
                      {Math.round(score * 100)}%
                    </div>
                  </div>

                  {/* Skills */}
                  {skills.length > 0 && (
                    <div className="rag-skills-tags">
                      {skills.slice(0, 8).map((skill, si) => (
                        <span key={si} className="rag-skill-tag">
                          {typeof skill === 'string' ? skill : skill.value || skill.name || skill}
                        </span>
                      ))}
                      {skills.length > 8 && (
                        <span className="rag-skill-tag rag-skill-more">
                          +{skills.length - 8} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Matched Sections */}
                  {matchedSections.length > 0 && (
                    <div className="rag-matched-sections">
                      {matchedSections.map((section, si) => (
                        <div key={si} className="rag-matched-section">
                          <button
                            className="rag-section-toggle"
                            onClick={() => toggleSection(idx, si)}
                          >
                            {expandedSections[`${idx}-${si}`]
                              ? <ChevronDown size={14} />
                              : <ChevronRight size={14} />
                            }
                            <span className="rag-section-name">
                              {section.section || section.sectionName || `Match ${si + 1}`}
                            </span>
                          </button>
                          {expandedSections[`${idx}-${si}`] && (
                            <p className="rag-section-snippet">
                              {section.content || section.snippet || section.text || ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="rag-actions">
                    <button
                      className="rag-action-btn rag-action-view"
                      onClick={() => onViewCandidate && onViewCandidate(candidate)}
                    >
                      <Eye size={14} /> View Profile
                    </button>
                    <button
                      className="rag-action-btn rag-action-email"
                      onClick={() => onEmailCandidate && onEmailCandidate(candidate)}
                    >
                      <Mail size={14} /> Send Email
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ask AI Answer */}
        {!loading && aiAnswer && (
          <div className="rag-ai-results">
            <div className="rag-ai-answer">
              <div className="rag-ai-answer-header">
                <Brain size={18} />
                <span>AI Analysis</span>
                {queryTime && (
                  <span className="rag-results-time" style={{ marginLeft: 'auto' }}>
                    {queryTime}ms
                  </span>
                )}
              </div>
              <div
                className="rag-ai-answer-body"
                dangerouslySetInnerHTML={{ __html: formatAnswer(aiAnswer.answer) }}
              />
            </div>

            {/* Sources */}
            {aiAnswer.sources && aiAnswer.sources.length > 0 && (() => {
              // Group and deduplicate sources by candidateId
              const uniqueSources = [];
              const seenIds = new Set();
              for (const source of aiAnswer.sources) {
                const srcCandidate = source.candidate || source;
                const cid = srcCandidate.candidateId || srcCandidate.id;
                if (cid) {
                  if (!seenIds.has(cid)) {
                    seenIds.add(cid);
                    uniqueSources.push(source);
                  }
                } else {
                  uniqueSources.push(source);
                }
              }

              return (
                <div className="rag-sources">
                  <div className="rag-sources-header">
                    <Database size={14} />
                    <span>Sources ({uniqueSources.length} candidate{uniqueSources.length !== 1 ? 's' : ''})</span>
                  </div>
                  <div className="rag-sources-grid">
                    {uniqueSources.map((source, idx) => {
                      const rawSrcCandidate = source.candidate || source;
                      const cid = rawSrcCandidate.candidateId || rawSrcCandidate.id;
                      const srcCandidate = candidates.find(c => c.id === cid) || rawSrcCandidate;
                      const srcName = srcCandidate.name || 'Unknown';
                      const srcScore = source.score ?? source.relevanceScore ?? 0;
                      return (
                        <div key={idx} className="rag-source-card" onClick={() => onViewCandidate && onViewCandidate(srcCandidate)}>
                          <div className="rag-source-top">
                            <User size={14} />
                            <span className="rag-source-name">{srcName}</span>
                            {srcScore > 0 && (
                              <span className={`rag-source-score ${getScoreColor(srcScore)}`}>
                                {Math.round(srcScore * 100)}%
                              </span>
                            )}
                          </div>
                          {srcCandidate.email && (
                            <span className="rag-source-email">{srcCandidate.email}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="rag-status-bar">
        <div className="rag-status-info">
          <Database size={13} />
          {ragStatus ? (
            <span>
              <strong>{ragStatus.totalCandidates ?? ragStatus.candidates ?? '—'}</strong> candidates indexed
              {(ragStatus.totalChunks ?? ragStatus.chunks) != null && (
                <> · <strong>{ragStatus.totalChunks ?? ragStatus.chunks}</strong> chunks</>
              )}
            </span>
          ) : (
            <span>Loading status...</span>
          )}
        </div>
        <button
          className="rag-reindex-btn"
          onClick={handleReindex}
          disabled={reindexing}
        >
          <RotateCcw size={13} className={reindexing ? 'rag-spin' : ''} />
          {reindexing ? 'Reindexing...' : 'Reindex'}
        </button>
      </div>

      {/* Indexing Warning */}
      {ragStatus && (ragStatus.totalChunks ?? ragStatus.chunks) === 0 && (
        <div className="rag-indexing-notice">
          <Loader2 size={14} className="rag-spin" />
          <span>No indexed data found. Click "Reindex" to index your candidates for AI search.</span>
        </div>
      )}
    </div>
  );
}
