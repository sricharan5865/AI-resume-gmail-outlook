import React, { useState, useEffect, useRef } from 'react';
import { Search, Tag, X, ChevronRight, Briefcase, Mail } from 'lucide-react';

export default function TagSearch({ candidates, jobs, backendUrl, onSelectCandidate, rankAccordingToJob }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeFilters, setActiveFilters] = useState([]);
  const [tagCloud, setTagCloud] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Filters state
  const [filterJobId, setFilterJobId] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [minScore, setMinScore] = useState(0);
  
  const searchInputRef = useRef(null);

  // Fetch tag cloud on load
  useEffect(() => {
    fetchTagCloud();
  }, []);

  // Handle autocomplete as user types
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const delayFn = setTimeout(() => {
        fetchSuggestions(searchQuery);
      }, 300); // Debounce typing
      return () => clearTimeout(delayFn);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  // Handle search dynamically in real-time as user types or adjusts filters (debounced by 300ms)
  useEffect(() => {
    const delayFn = setTimeout(() => {
      performSearch();
    }, 300);
    return () => clearTimeout(delayFn);
  }, [activeFilters, searchQuery]);

  const fetchTagCloud = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/search/tag-cloud`);
      const data = await res.json();
      setTagCloud(data.cloud || []);
    } catch (e) {
      console.error('Failed to fetch tag cloud', e);
    }
  };

  const fetchSuggestions = async (prefix) => {
    try {
      const res = await fetch(`${backendUrl}/api/search/suggestions?prefix=${encodeURIComponent(prefix)}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error('Failed to fetch suggestions', e);
    }
  };

  const performSearch = async () => {
    const queryParts = [...activeFilters];
    if (searchQuery.trim()) {
      queryParts.push(searchQuery.trim());
    }
    const queryStr = queryParts.join(' ');

    if (!queryStr.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`${backendUrl}/api/search/tags?q=${encodeURIComponent(queryStr)}`);
      const data = await res.json();
      
      // matches comes back as { id, score }
      const matchedIds = data.matches || [];
      const populatedResults = matchedIds.map(match => {
        const candidate = candidates.find(c => c.id === match.id);
        return { ...candidate, _searchScore: match.score };
      }).filter(c => c !== undefined);

      setSearchResults(populatedResults);
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setIsSearching(false);
    }
  };

  const addFilter = (tag) => {
    if (!activeFilters.includes(tag)) {
      setActiveFilters([...activeFilters, tag]);
    }
    setSearchQuery('');
    setSuggestions([]);
    searchInputRef.current?.focus();
  };

  const removeFilter = (tagToRemove) => {
    setActiveFilters(activeFilters.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      addFilter(searchQuery.trim());
    } else if (e.key === 'Backspace' && searchQuery === '' && activeFilters.length > 0) {
      // Remove last filter when hitting backspace on empty input
      removeFilter(activeFilters[activeFilters.length - 1]);
    }
  };

  // Helper to map category to color class
  const getCategoryColorClass = (category) => {
    const lower = (category || '').toLowerCase();
    if (lower.includes('seniority')) return 'tag-seniority';
    if (lower.includes('domain') || lower.includes('role')) return 'tag-domain';
    if (lower.includes('stack') || lower.includes('tech')) return 'tag-tech';
    if (lower.includes('experience')) return 'tag-experience';
    return 'tag-default';
  };

  const filteredResults = searchResults.filter(c => {
    if (filterJobId && c.jobId !== filterJobId) return false;
    if (filterStage && c.stage.toLowerCase() !== filterStage.toLowerCase()) return false;
    const score = rankAccordingToJob ? c.matchScore : (c.ownCategoryScore ?? c.matchScore);
    if (score < minScore) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
      
      {/* Search Header */}
      <div className="glass" style={{ padding: '32px', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={24} style={{ color: 'var(--accent-primary)' }} />
          Advanced Tag Search
        </h2>
        
        {/* Search Input Bar */}
        <div style={{ position: 'relative' }}>
          <div 
            style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '8px', 
              background: 'var(--bg-tertiary)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: 'var(--radius-md)', 
              padding: '8px 16px',
              minHeight: '52px',
              alignItems: 'center',
              transition: 'border-color 0.2s',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            {/* Active Filters */}
            {activeFilters.map(filter => (
              <div 
                key={filter} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  background: 'var(--accent-gradient)', 
                  color: 'white', 
                  padding: '4px 10px', 
                  borderRadius: '16px', 
                  fontSize: '13px',
                  fontWeight: '500'
                }}
              >
                <span>{filter}</span>
                <button 
                  onClick={() => removeFilter(filter)} 
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Input Field */}
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder={activeFilters.length === 0 ? "Search by tags (e.g., 'React', 'Senior', '5+ years')" : "Add more tags..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: 'var(--text-primary)', 
                fontSize: '15px', 
                flexGrow: 1, 
                minWidth: '200px',
                outline: 'none'
              }} 
            />
          </div>

          {/* Suggestions Dropdown */}
          {suggestions.length > 0 && (
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
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
              {suggestions.map((suggestion, idx) => (
                <div 
                  key={idx} 
                  className="suggestion-item"
                  style={{ 
                    padding: '12px 16px', 
                    cursor: 'pointer', 
                    borderBottom: idx < suggestions.length - 1 ? '1px solid var(--glass-border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onClick={() => addFilter(suggestion)}
                >
                  <Tag size={14} style={{ color: 'var(--text-secondary)' }} />
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', flexGrow: 1, overflow: 'hidden' }}>
        
        {/* Left Column: Tag Cloud */}
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={16} /> Global Tag Cloud
          </h3>
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '8px', paddingRight: '8px' }}>
            {tagCloud.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No tags generated yet.</span>
            ) : (
              tagCloud.map((t, idx) => {
                // Calculate size based on frequency relative to max frequency
                const maxCount = tagCloud[0].count;
                const minCount = tagCloud[tagCloud.length - 1].count;
                const sizeRatio = maxCount === minCount ? 0.5 : (t.count - minCount) / (maxCount - minCount);
                // Size range from 11px to 22px
                const fontSize = 11 + Math.round(sizeRatio * 11);
                
                const isSelected = activeFilters.includes(t.value);
                const colorClass = getCategoryColorClass(t.category);

                return (
                  <button
                    key={idx}
                    onClick={() => !isSelected && addFilter(t.value)}
                    className={`tag-badge ${colorClass}`}
                    style={{ 
                      fontSize: `${fontSize}px`, 
                      padding: `${Math.max(4, fontSize - 6)}px ${Math.max(8, fontSize - 2)}px`,
                      opacity: isSelected ? 0.5 : 1,
                      cursor: isSelected ? 'default' : 'pointer',
                      border: isSelected ? '1px solid var(--text-secondary)' : '',
                      transition: 'transform 0.2s, filter 0.2s',
                    }}
                  >
                    {t.value} <span style={{ opacity: 0.6, fontSize: '0.8em', marginLeft: '4px' }}>{t.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Search Results */}
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '18px' }}>
              Results {filteredResults.length > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 'normal' }}>({filteredResults.length} found)</span>}
            </h3>

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Job filter dropdown */}
              <select 
                className="form-input" 
                style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }}
                value={filterJobId}
                onChange={(e) => setFilterJobId(e.target.value)}
              >
                <option value="">All Jobs</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>

              {/* Stage filter dropdown */}
              <select 
                className="form-input" 
                style={{ width: '110px', padding: '4px 8px', fontSize: '12px' }}
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
              >
                <option value="">All Stages</option>
                <option value="Inbox">Inbox</option>
                <option value="Shortlist">Shortlist</option>
                <option value="Interview">Interview</option>
                <option value="Offered">Offered</option>
                <option value="Rejected">Rejected</option>
              </select>

              {/* Min score input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Min Score:</span>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ width: '55px', padding: '4px 8px', fontSize: '12px' }}
                  min="0"
                  max="100"
                  value={minScore || ''}
                  placeholder="0"
                  onChange={(e) => setMinScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                />
              </div>

              {/* Clear filters button */}
              {(filterJobId || filterStage || minScore > 0) && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: '28px' }}
                  onClick={() => {
                    setFilterJobId('');
                    setFilterStage('');
                    setMinScore(0);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
            {activeFilters.length === 0 && !searchQuery.trim() ? (
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
                  <Search size={36} />
                </div>
                <div style={{ textAlign: 'center', maxWidth: '320px' }}>
                  <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '15px', fontWeight: '600' }}>Awaiting Search Queries</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Select tags from the cloud or type a keyword above to trigger the real-time index retrieval.
                  </p>
                </div>
                {/* Skeleton cards outline */}
                <div style={{ width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: 0.1, marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--text-secondary)' }}></div>
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ height: '10px', background: 'var(--text-secondary)', borderRadius: '4px', width: '50%' }}></div>
                      <div style={{ height: '6px', background: 'var(--text-secondary)', borderRadius: '4px', width: '80%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : isSearching ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Searching index...</div>
            ) : filteredResults.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>No candidates match these tags and filters.</div>
            ) : (
              filteredResults.map(candidate => {
                const job = jobs.find(j => j.id === candidate.jobId);
                const score = rankAccordingToJob ? candidate.matchScore : (candidate.ownCategoryScore ?? candidate.matchScore);
                const scoreColorClass = score >= 80 ? 'score-high' : score >= 50 ? 'score-medium' : 'score-low';
                
                return (
                  <div 
                    key={candidate.id} 
                    className="glass-interactive" 
                    style={{ 
                      padding: '16px', 
                      borderRadius: 'var(--radius-md)', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px',
                      background: 'var(--kanban-column-bg)',
                      border: '1px solid var(--glass-border)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{candidate.name}</h4>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Briefcase size={12} /> {job ? job.title : 'General'}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {candidate.email || 'N/A'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className={`score-badge ${scoreColorClass}`} style={{ width: '36px', height: '36px', fontSize: '14px' }}>
                          {score}
                        </div>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => onSelectCandidate(candidate)}
                        >
                          View <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Display tags for this candidate, highlighting ones that matched */}
                    {candidate.tags && candidate.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {candidate.tags.map((t, idx) => {
                          // Check if this tag matches any of the active filters (simple includes check for highlighting)
                          const isMatch = activeFilters.some(filter => 
                            t.value.toLowerCase().includes(filter.toLowerCase()) || 
                            filter.toLowerCase().includes(t.value.toLowerCase())
                          );
                          const colorClass = getCategoryColorClass(t.category);
                          
                          return (
                            <span 
                              key={idx} 
                              className={`tag-badge ${colorClass}`}
                              style={{ 
                                fontSize: '11px', 
                                padding: '3px 8px',
                                border: isMatch ? '1px solid currentColor' : '1px solid transparent',
                                opacity: isMatch ? 1 : 0.6
                              }}
                            >
                              {t.value}
                            </span>
                          );
                        })}
                      </div>
                    )}
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
