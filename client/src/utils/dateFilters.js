/**
 * Shared date filtering utilities for HR Recruiter frontend.
 */

export const getCandidateDate = (candidate) => {
  if (!candidate) return new Date(0);
  if (candidate.createdAt) {
    const d = new Date(candidate.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (candidate.id && candidate.id.startsWith('candidate-')) {
    const tsPart = candidate.id.split('-')[1]; // handles candidate-timestamp-random format too
    const ts = parseInt(tsPart, 10);
    if (!isNaN(ts)) return new Date(ts);
  }
  return new Date(0); // Safe fallback to epoch
};

export const matchDateRangeHelper = (date, filterRange) => {
  if (!filterRange) return true;
  if (!date || isNaN(date.getTime())) return false;

  const now = new Date();
  const diffTime = now - date;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  switch (filterRange) {
    case 'last-24h': return diffDays <= 1;
    case 'last-1w': return diffDays <= 7;
    case 'last-2w': return diffDays <= 14;
    case 'last-1m': return diffDays <= 30.5;
    case 'last-3m': return diffDays <= 91.5;
    case 'last-6m': return diffDays <= 183;
    case 'last-1y': return diffDays <= 365;
    case 'before-1w': return diffDays > 7;
    case 'before-2w': return diffDays > 14;
    case 'before-1m': return diffDays > 30.5;
    case 'before-3m': return diffDays > 91.5;
    case 'before-6m': return diffDays > 183;
    case 'before-1y': return diffDays > 365;
    default: return true;
  }
};
