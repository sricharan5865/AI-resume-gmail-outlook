/**
 * Advanced in-memory tag search engine for TalentFlow.
 * Includes inverted index, trigram tokenization for fuzzy search, and a Trie for autocomplete.
 */

class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
    this.tags = new Set(); // Stores actual original tags that pass through this node
  }
}

class SearchIndex {
  constructor() {
    this.tagToCandidateIds = new Map(); // Exact tag string -> Set of candidate IDs
    this.trigramIndex = new Map(); // Trigram -> Set of exact tag strings
    this.trieRoot = new TrieNode();
    this.tagFrequencies = new Map(); // Tag value -> Count
    this.tagCategories = new Map(); // Tag value -> Category
  }

  // Generate 3-character grams from a string
  getTrigrams(str) {
    const text = str.toLowerCase();
    const trigrams = new Set();
    const padded = `  ${text}  `; // Pad to match start/end grams
    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.slice(i, i + 3));
    }
    return Array.from(trigrams);
  }

  // Insert word into Trie for autocomplete
  insertToTrie(tag) {
    let node = this.trieRoot;
    const lowerTag = tag.toLowerCase();
    for (const char of lowerTag) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
      node.tags.add(tag); // Add the actual tag string to all prefix nodes for quick suggestions
    }
    node.isEndOfWord = true;
  }

  // Find all tags starting with prefix using Trie
  getSuggestions(prefix, limit = 10) {
    const lowerPrefix = prefix.toLowerCase();
    let node = this.trieRoot;
    
    for (const char of lowerPrefix) {
      if (!node.children[char]) {
        return []; // Prefix not found
      }
      node = node.children[char];
    }
    
    // Convert to array and take top results based on frequency
    return Array.from(node.tags)
      .sort((a, b) => (this.tagFrequencies.get(b) || 0) - (this.tagFrequencies.get(a) || 0))
      .slice(0, limit);
  }

  // Rebuild the entire index from a list of candidates
  buildIndex(candidates) {
    this.candidates = candidates;
    // Clear existing indexes
    this.tagToCandidateIds.clear();
    this.trigramIndex.clear();
    this.trieRoot = new TrieNode();
    this.tagFrequencies.clear();
    this.tagCategories.clear();

    candidates.forEach(candidate => {
      if (!candidate.tags || !Array.isArray(candidate.tags)) return;
      
      candidate.tags.forEach(tagObj => {
        const tagValue = tagObj.value;
        const tagCategory = tagObj.category;
        
        if (!tagValue || typeof tagValue !== 'string') return; // Skip malformed tags
        
        // 1. Update Inverted Index (Tag -> Candidate IDs)
        if (!this.tagToCandidateIds.has(tagValue)) {
          this.tagToCandidateIds.set(tagValue, new Set());
          this.insertToTrie(tagValue);
        }
        this.tagToCandidateIds.get(tagValue).add(candidate.id);

        // 2. Update Trigram Index for fuzzy searching
        const trigrams = this.getTrigrams(tagValue);
        trigrams.forEach(gram => {
          if (!this.trigramIndex.has(gram)) {
            this.trigramIndex.set(gram, new Set());
          }
          this.trigramIndex.get(gram).add(tagValue);
        });

        // 3. Update Frequencies for Tag Cloud
        this.tagFrequencies.set(tagValue, (this.tagFrequencies.get(tagValue) || 0) + 1);
        
        // 4. Store category mapping
        if (!this.tagCategories.has(tagValue)) {
          this.tagCategories.set(tagValue, tagCategory);
        }
      });
    });
    
    console.log(`Search index rebuilt: ${this.tagToCandidateIds.size} unique tags indexed.`);
  }

  // Search candidates using Trigram fuzzy matching and full-text keyword searches across all candidate profile details and document text
  searchTags(query) {
    if (!query || query.trim() === '') return [];
    
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return [];

    const candidateScores = new Map(); // candidateId -> score
    
    if (this.candidates && this.candidates.length > 0) {
      this.candidates.forEach(candidate => {
        let candidateTextScore = 0;
        
        terms.forEach(term => {
          const countOccurrences = (sourceText, searchTerm) => {
            if (!sourceText || typeof sourceText !== 'string') return 0;
            const regex = new RegExp(searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            const matches = sourceText.match(regex);
            return matches ? matches.length : 0;
          };

          // 1. Tags
          if (candidate.tags && Array.isArray(candidate.tags)) {
            candidate.tags.forEach(tagObj => {
              candidateTextScore += countOccurrences(tagObj.value, term);
            });
          }

          // 2. Name & Email & Phone
          candidateTextScore += countOccurrences(candidate.name, term);
          candidateTextScore += countOccurrences(candidate.email, term);
          candidateTextScore += countOccurrences(candidate.phone, term);

          // 3. Skills
          if (candidate.skills && Array.isArray(candidate.skills)) {
            candidate.skills.forEach(skill => {
              candidateTextScore += countOccurrences(skill, term);
            });
          }

          // 4. Experience
          if (candidate.experience && Array.isArray(candidate.experience)) {
            candidate.experience.forEach(exp => {
              candidateTextScore += countOccurrences(exp.role, term);
              candidateTextScore += countOccurrences(exp.company, term);
              candidateTextScore += countOccurrences(exp.description, term);
            });
          }

          // 5. Education
          if (candidate.education && Array.isArray(candidate.education)) {
            candidate.education.forEach(edu => {
              candidateTextScore += countOccurrences(edu.degree, term);
              candidateTextScore += countOccurrences(edu.institution, term);
            });
          }

          // 6. Comments & Match Explanation
          candidateTextScore += countOccurrences(candidate.comments, term);
          candidateTextScore += countOccurrences(candidate.matchExplanation, term);

          // 7. Resume Text (Full PDF text content)
          candidateTextScore += countOccurrences(candidate.resumeText, term);
        });

        if (candidateTextScore > 0) {
          candidateScores.set(candidate.id, (candidateScores.get(candidate.id) || 0) + candidateTextScore);
        }
      });
    }

    // Return candidates sorted by score descending
    return Array.from(candidateScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ id, score }));
  }

  // Returns data formatted for a Tag Cloud visualization
  getTagCloud() {
    return Array.from(this.tagFrequencies.entries()).map(([value, count]) => ({
      value,
      count,
      category: this.tagCategories.get(value) || 'Other'
    })).sort((a, b) => b.count - a.count); // Highest count first
  }
}

// Export a singleton instance
export const searchIndex = new SearchIndex();
