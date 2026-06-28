import dotenv from 'dotenv';
import { Settings } from './models.js';

dotenv.config();

/** @type {Map<string, number[]>} LRU cache for query embeddings (max 200 entries) */
const queryEmbeddingCache = new Map();
const CACHE_MAX_SIZE = 200;

/**
 * Reads AI settings from the database to determine the API key and provider for embeddings.
 * Falls back to environment variables if DB settings are unavailable.
 * @returns {Promise<{ apiKey: string, isOpenRouter: boolean, provider: string }>}
 */
export async function getEmbeddingConfig() {
  let settings = null;
  try {
    settings = await Settings.findById('global');
  } catch (e) {
    console.error('EmbeddingService: Failed to read settings from DB:', e.message);
  }

  const provider = settings?.aiProvider || 'gemini';
  let apiKey;
  
  if (provider === 'gemini') {
    apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  } else if (provider === 'openai') {
    apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  } else if (provider === 'claude') {
    apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
  } else {
    apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  }

  if (!apiKey) {
    throw new Error('No API key configured for embeddings.');
  }

  const isOpenRouter = apiKey.startsWith('sk-or-');
  const embeddingProvider = isOpenRouter ? 'openrouter' : 'gemini';

  return { apiKey, isOpenRouter, provider: embeddingProvider };
}

/**
 * Delays execution for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Makes an API call with retry logic and exponential backoff.
 * @param {Function} apiCallFn - Async function that performs the API call
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<*>} The result from the successful API call
 */
async function withRetry(apiCallFn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCallFn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 500; // 500ms, 1000ms, 2000ms
        console.warn(`EmbeddingService: Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms — ${err.message}`);
        await delay(backoffMs);
      }
    }
  }
  throw lastError;
}

/**
 * Generates embeddings for a batch of texts via the OpenRouter API.
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedViaOpenRouter(texts, apiKey) {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: texts,
      dimensions: 768
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Embeddings API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  if (!result.data || !Array.isArray(result.data)) {
    throw new Error(`Invalid response format from OpenRouter Embeddings: ${JSON.stringify(result)}`);
  }
  // Sort by index to ensure correct ordering
  const sorted = result.data.sort((a, b) => a.index - b.index);
  return sorted.map(item => item.embedding);
}

/**
 * Generates embeddings for a batch of texts via the direct Google Gemini API.
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} apiKey - Google AI API key
 * @param {string} taskType - Embedding task type ('RETRIEVAL_DOCUMENT' or 'RETRIEVAL_QUERY')
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedViaGemini(texts, apiKey, taskType = 'RETRIEVAL_DOCUMENT') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;

  const requestBody = {
    requests: texts.map(t => ({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: t }] },
      taskType
    }))
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embeddings API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.embeddings.map(e => e.values);
}

/**
 * Generates vector embeddings for an array of text strings.
 * Batches in groups of 100, with rate-limiting delays between batches.
 * Uses RETRIEVAL_DOCUMENT task type (optimized for indexing documents).
 *
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} Array of 768-dimensional embedding vectors
 */
export async function embedTexts(texts) {
  if (!texts || texts.length === 0) return [];

  const { apiKey, isOpenRouter } = await getEmbeddingConfig();
  const BATCH_SIZE = 100;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const embeddings = await withRetry(async () => {
      if (isOpenRouter) {
        return await embedViaOpenRouter(batch, apiKey);
      } else {
        return await embedViaGemini(batch, apiKey, 'RETRIEVAL_DOCUMENT');
      }
    });

    allEmbeddings.push(...embeddings);

    // Rate-limiting delay between batches (skip after last batch)
    if (i + BATCH_SIZE < texts.length) {
      await delay(200);
    }
  }

  return allEmbeddings;
}

/**
 * Generates a single vector embedding optimized for retrieval queries.
 * Results are cached in an LRU cache to avoid re-embedding identical queries.
 *
 * @param {string} query - The search query text
 * @returns {Promise<number[]>} A 768-dimensional embedding vector
 */
export async function embedQuery(query) {
  if (!query || query.trim().length === 0) {
    throw new Error('Cannot embed an empty query.');
  }

  const cacheKey = query.trim().toLowerCase();

  // Check LRU cache
  if (queryEmbeddingCache.has(cacheKey)) {
    // Move to end (most recently used) by re-inserting
    const cached = queryEmbeddingCache.get(cacheKey);
    queryEmbeddingCache.delete(cacheKey);
    queryEmbeddingCache.set(cacheKey, cached);
    return cached;
  }

  const { apiKey, isOpenRouter } = await getEmbeddingConfig();

  const embedding = await withRetry(async () => {
    if (isOpenRouter) {
      const results = await embedViaOpenRouter([query.trim()], apiKey);
      return results[0];
    } else {
      const results = await embedViaGemini([query.trim()], apiKey, 'RETRIEVAL_QUERY');
      return results[0];
    }
  });

  // Add to LRU cache, evicting oldest if at capacity
  if (queryEmbeddingCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    queryEmbeddingCache.delete(oldestKey);
  }
  queryEmbeddingCache.set(cacheKey, embedding);

  return embedding;
}

/**
 * Computes the cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity score
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
