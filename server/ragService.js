import { ResumeChunk, Candidate, Settings } from './models.js';
import { embedTexts, embedQuery, cosineSimilarity } from './embeddingService.js';
import { callAIProvider } from './geminiParser.js';

/**
 * In-memory vector index for fast cosine similarity search.
 * @type {Array<{ chunkId: string, candidateId: string, section: string, embedding: number[], text: string, metadata: object }>}
 */
let vectorIndex = [];

/** @type {Date|null} Timestamp of the last completed indexing operation */
let lastIndexedAt = null;

/**
 * Delays execution for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Loads all ResumeChunks from MongoDB into the in-memory vector index.
 * Called on server startup to hydrate the search index.
 *
 * @returns {Promise<number>} The number of chunks loaded into memory
 */
export async function loadVectorIndex() {
  try {
    const chunks = await ResumeChunk.find({}).lean();
    vectorIndex = chunks.map(chunk => ({
      chunkId: chunk.chunkId,
      candidateId: chunk.candidateId,
      section: chunk.section,
      embedding: chunk.embedding,
      text: chunk.text,
      metadata: chunk.metadata || {}
    }));
    console.log(`RAG: Loaded ${vectorIndex.length} chunks into memory.`);
    return vectorIndex.length;
  } catch (err) {
    console.error('RAG: Failed to load vector index from MongoDB:', err.message);
    vectorIndex = [];
    return 0;
  }
}

/**
 * Splits a candidate document into semantic chunks for embedding.
 * Each chunk includes the candidate name for context and a unique chunkId.
 *
 * @param {object} candidate - A Mongoose Candidate document
 * @returns {Array<{ chunkId: string, section: string, text: string, metadata: object }>}
 */
export function chunkCandidate(candidate) {
  const chunks = [];
  const name = candidate.name || 'Unknown';
  const id = candidate.id;

  // Contact chunk
  const contactParts = [];
  if (candidate.email) contactParts.push(`Email: ${candidate.email}`);
  if (candidate.phone) contactParts.push(`Phone: ${candidate.phone}`);
  if (candidate.linkedinUrl) contactParts.push(`LinkedIn: ${candidate.linkedinUrl}`);
  if (contactParts.length > 0) {
    chunks.push({
      chunkId: `${id}::contact`,
      section: 'contact',
      text: `Candidate: ${name} | Contact: ${contactParts.join(', ')}`,
      metadata: { name, seniority: candidate.seniorityLevel || 'Mid' }
    });
  }

  // Skills chunk
  if (candidate.skills && candidate.skills.length > 0) {
    chunks.push({
      chunkId: `${id}::skills`,
      section: 'skills',
      text: `Candidate: ${name} | Skills: ${candidate.skills.join(', ')}`,
      metadata: { name, seniority: candidate.seniorityLevel || 'Mid' }
    });
  }

  // Experience chunks (one per entry)
  if (candidate.experience && candidate.experience.length > 0) {
    candidate.experience.forEach((exp, idx) => {
      if (!exp.role && !exp.company) return; // Skip empty entries
      const parts = [];
      if (exp.role) parts.push(exp.role);
      if (exp.company) parts.push(`at ${exp.company}`);
      if (exp.duration) parts.push(`(${exp.duration})`);
      if (exp.description) parts.push(`- ${exp.description}`);

      chunks.push({
        chunkId: `${id}::experience::${idx}`,
        section: 'experience',
        text: `Candidate: ${name} | Experience: ${parts.join(' ')}`,
        metadata: {
          name,
          company: exp.company || '',
          role: exp.role || '',
          seniority: candidate.seniorityLevel || 'Mid'
        }
      });
    });
  }

  // Education chunks (one per entry)
  if (candidate.education && candidate.education.length > 0) {
    candidate.education.forEach((edu, idx) => {
      if (!edu.degree && !edu.institution) return; // Skip empty entries
      const parts = [];
      if (edu.degree) parts.push(edu.degree);
      if (edu.institution) parts.push(`from ${edu.institution}`);
      if (edu.year) parts.push(`(${edu.year})`);

      chunks.push({
        chunkId: `${id}::education::${idx}`,
        section: 'education',
        text: `Candidate: ${name} | Education: ${parts.join(' ')}`,
        metadata: { name, seniority: candidate.seniorityLevel || 'Mid' }
      });
    });
  }

  // Summary chunk (first 2000 chars of resume text)
  if (candidate.resumeText && candidate.resumeText.trim().length > 0) {
    chunks.push({
      chunkId: `${id}::summary`,
      section: 'summary',
      text: `Candidate: ${name} | Resume Summary: ${candidate.resumeText.substring(0, 2000)}`,
      metadata: { name, seniority: candidate.seniorityLevel || 'Mid' }
    });
  }

  // Tags chunk
  if (candidate.tags && candidate.tags.length > 0) {
    const tagValues = candidate.tags.map(t => t.value).filter(Boolean);
    if (tagValues.length > 0) {
      chunks.push({
        chunkId: `${id}::tags`,
        section: 'tags',
        text: `Candidate: ${name} | Tags: ${tagValues.join(', ')}`,
        metadata: { name, seniority: candidate.seniorityLevel || 'Mid' }
      });
    }
  }

  return chunks;
}

/**
 * Indexes a single candidate: chunks their data, generates embeddings,
 * upserts into MongoDB, and updates the in-memory vector index.
 *
 * @param {object} candidate - A Mongoose Candidate document
 * @returns {Promise<number>} Number of chunks indexed
 */
export async function indexCandidate(candidate) {
  const chunks = chunkCandidate(candidate);
  if (chunks.length === 0) return 0;

  // Generate embeddings for all chunk texts in a single batch
  const texts = chunks.map(c => c.text);
  const embeddings = await embedTexts(texts);

  // Build bulk operations for MongoDB upsert
  const bulkOps = chunks.map((chunk, idx) => ({
    updateOne: {
      filter: { chunkId: chunk.chunkId },
      update: {
        $set: {
          chunkId: chunk.chunkId,
          candidateId: candidate.id,
          section: chunk.section,
          text: chunk.text,
          embedding: embeddings[idx],
          metadata: chunk.metadata
        }
      },
      upsert: true
    }
  }));

  await ResumeChunk.bulkWrite(bulkOps);

  // Update in-memory index: remove old entries for this candidate, add new ones
  vectorIndex = vectorIndex.filter(v => v.candidateId !== candidate.id);
  chunks.forEach((chunk, idx) => {
    vectorIndex.push({
      chunkId: chunk.chunkId,
      candidateId: candidate.id,
      section: chunk.section,
      embedding: embeddings[idx],
      text: chunk.text,
      metadata: chunk.metadata
    });
  });

  lastIndexedAt = new Date();
  return chunks.length;
}

/**
 * Removes all ResumeChunks for a given candidateId from both
 * MongoDB and the in-memory vector index.
 *
 * @param {string} candidateId - The candidate's unique ID
 * @returns {Promise<number>} Number of chunks removed
 */
export async function removeCandidate(candidateId) {
  const result = await ResumeChunk.deleteMany({ candidateId });
  const beforeCount = vectorIndex.length;
  vectorIndex = vectorIndex.filter(v => v.candidateId !== candidateId);
  const removed = beforeCount - vectorIndex.length;
  console.log(`RAG: Removed ${removed} chunks for candidate ${candidateId}`);
  return removed;
}

/**
 * Indexes all candidates in the database. Processes in batches of 5 to
 * manage embedding API rate limits.
 *
 * @param {Function} [progressCallback] - Called with (current, total) during processing
 * @returns {Promise<{ indexed: number, total: number, errors: number }>}
 */
export async function indexAllCandidates(progressCallback) {
  const candidates = await Candidate.find().lean();
  const total = candidates.length;
  let indexed = 0;
  let errors = 0;
  const BATCH_SIZE = 5;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    for (const candidate of batch) {
      try {
        await indexCandidate(candidate);
        indexed++;
      } catch (err) {
        errors++;
        console.error(`RAG: Failed to index candidate ${candidate.name || candidate.id}:`, err.message);
      }
    }

    if (progressCallback) {
      progressCallback(Math.min(i + BATCH_SIZE, total), total);
    }

    // Rate-limiting delay between batches (skip after last batch)
    if (i + BATCH_SIZE < candidates.length) {
      await delay(500);
    }
  }

  lastIndexedAt = new Date();
  console.log(`RAG: Indexing complete. ${indexed}/${total} candidates indexed, ${errors} errors.`);
  return { indexed, total, errors };
}

/**
 * Core semantic search: embeds the query and finds the most relevant
 * candidates by cosine similarity against the in-memory vector index.
 *
 * @param {string} query - Natural language search query
 * @param {number} [topK=10] - Number of top candidates to return
 * @param {string|null} [jobId=null] - Optional jobId to filter candidates
 * @returns {Promise<{ results: Array, queryTimeMs: number, totalChunksSearched: number }>}
 */
export async function searchResumes(query, topK = 10, jobId = null) {
  const startTime = Date.now();

  if (vectorIndex.length === 0) {
    return { results: [], queryTimeMs: Date.now() - startTime, totalChunksSearched: 0 };
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query);

  // Compute cosine similarity against all vectors
  let scoredChunks = vectorIndex.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  // Filter by jobId if provided
  if (jobId) {
    // Get candidateIds that belong to this job
    const jobCandidates = await Candidate.find({ jobId }, { id: 1 }).lean();
    const jobCandidateIds = new Set(jobCandidates.map(c => c.id));
    scoredChunks = scoredChunks.filter(c => jobCandidateIds.has(c.candidateId));
  }

  // Group by candidateId: collect all matching sections, keep best score per candidate
  const candidateMap = new Map();
  for (const chunk of scoredChunks) {
    if (!candidateMap.has(chunk.candidateId)) {
      candidateMap.set(chunk.candidateId, {
        candidateId: chunk.candidateId,
        bestScore: chunk.score,
        matchedSections: []
      });
    }

    const entry = candidateMap.get(chunk.candidateId);
    if (chunk.score > entry.bestScore) {
      entry.bestScore = chunk.score;
    }
    // Only include sections with reasonable relevance
    if (chunk.score > 0.3) {
      entry.matchedSections.push({
        section: chunk.section,
        text: chunk.text,
        score: Math.round(chunk.score * 1000) / 1000
      });
    }
  }

  // Sort by best score descending and take topK
  const topCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, topK);

  // Fetch full candidate documents for the results
  const candidateIds = topCandidates.map(c => c.candidateId);
  const candidateDocs = await Candidate.find({ id: { $in: candidateIds } }).lean();
  const candidateDocMap = new Map(candidateDocs.map(c => [c.id, c]));

  // Enrich results with candidate data
  const results = topCandidates
    .map(tc => {
      const doc = candidateDocMap.get(tc.candidateId);
      if (!doc) return null;

      return {
        candidateId: tc.candidateId,
        name: doc.name || 'Unknown',
        email: doc.email || '',
        skills: doc.skills || [],
        seniorityLevel: doc.seniorityLevel || 'Mid',
        relevanceScore: Math.round(tc.bestScore * 1000) / 1000,
        matchedSections: tc.matchedSections
          .sort((a, b) => b.score - a.score)
          .slice(0, 5), // Limit to top 5 sections per candidate
        resumeUrl: doc.resumeUrl || '',
        stage: doc.stage || 'Inbox',
        matchScore: doc.matchScore || 0
      };
    })
    .filter(Boolean);

  return {
    results,
    queryTimeMs: Date.now() - startTime,
    totalChunksSearched: vectorIndex.length
  };
}

/**
 * Full RAG pipeline: searches for relevant candidates, builds context,
 * and generates an AI-powered answer citing specific candidate data.
 *
 * @param {string} query - The recruiter's natural language question
 * @param {number} [topK=5] - Number of candidates to include as context
 * @returns {Promise<{ answer: string, sources: Array, queryTimeMs: number }>}
 */
export async function ragAnswer(query, topK = 5) {
  const startTime = Date.now();

  // Step 1: Retrieve relevant candidates via semantic search
  const searchResult = await searchResumes(query, topK);

  if (searchResult.results.length === 0) {
    return {
      answer: 'No relevant candidates found in the database for your query. Try rephrasing your question or ensure candidates have been indexed.',
      sources: [],
      queryTimeMs: Date.now() - startTime
    };
  }

  // Step 2: Build context from matched sections
  const contextParts = [];
  const sources = [];

  for (const result of searchResult.results) {
    contextParts.push(`\n--- Candidate: ${result.name} (Score: ${result.relevanceScore}) ---`);
    for (const section of result.matchedSections) {
      contextParts.push(`[${section.section.toUpperCase()}] ${section.text}`);
      sources.push({
        candidateId: result.candidateId,
        name: result.name,
        section: section.section,
        text: section.text
      });
    }
  }

  const context = contextParts.join('\n');

  // Step 3: Call AI for answer generation
  const systemInstruction = 'You are an expert HR recruiter assistant. Based on the resume data provided, answer the recruiter\'s question. Be specific, cite candidate names, and provide actionable insights. If comparing candidates, create a clear ranking with justification.';

  const prompt = `Recruiter's Question: ${query}

Relevant Candidate Data:
${context}

Based on the above candidate data, provide a comprehensive answer to the recruiter's question. Reference specific candidates by name and cite relevant details from their profiles.`;

  let answer;
  try {
    answer = await callAIProvider(prompt, systemInstruction);
  } catch (err) {
    console.error('RAG: AI answer generation failed:', err.message);
    answer = `I found ${searchResult.results.length} relevant candidates but couldn't generate a detailed answer. Top matches: ${searchResult.results.map(r => `${r.name} (${r.relevanceScore})`).join(', ')}`;
  }

  return {
    answer,
    sources,
    queryTimeMs: Date.now() - startTime
  };
}

/**
 * Returns the current status of the RAG system including
 * index statistics and initialization state.
 *
 * @returns {Promise<{ initialized: boolean, totalChunks: number, totalCandidates: number, lastIndexedAt: Date|null }>}
 */
export async function getRAGStatus() {
  const uniqueCandidateIds = new Set(vectorIndex.map(v => v.candidateId));
  return {
    initialized: vectorIndex.length > 0,
    totalChunks: vectorIndex.length,
    totalCandidates: uniqueCandidateIds.size,
    lastIndexedAt
  };
}
