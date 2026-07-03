# Ollama Integration Points & Optimization Audit

This report presents a detailed audit of `server/emailCategorizer.js` and `server/embeddingService.js` regarding their Ollama integration points, prompt token sizes, parameters alignment with `AGENTS.md` rules, and recommendations for optimization.

---

## Executive Summary

- **`server/emailCategorizer.js` (Classification)**:
  - Calls `/api/chat` using a compact prompt (~240 tokens).
  - Explicitly sets `num_ctx: 2048` and `num_predict: 256` in the request options.
  - Aligns **perfectly** with `AGENTS.md` rules.
  - Timeout is set to `180000` ms (180 seconds), preventing premature 504 errors on model cold starts.

- **`server/embeddingService.js` (Indexing/Embeddings)**:
  - Calls `/api/embed` with an array of texts.
  - **No `options` object (including `num_ctx`) is passed** in the request body, which is a direct violation of the explicit parameter tuning rules in `AGENTS.md`.
  - The default batch size of `100` is hardcoded across all providers. Running this batch size locally on resource-constrained Ollama setups can trigger memory spikes, high latency, or timeouts.
  - **Configuration Conflict**: The database settings model (`server/models.js`) only has a single `ollamaModel` configuration field (defaulting to `llama3`). Since `embeddingService.js` falls back to `settings?.ollamaModel` before defaulting to `nomic-embed-text`, configuring Ollama in the settings dashboard will cause the application to try to embed texts using the chat model (`llama3`). This will either fail or generate garbage vectors.

---

## Detailed Audit: `server/emailCategorizer.js`

### 1. Ollama Call Location & Prompt Structure
- **File & Line**: `server/emailCategorizer.js` (lines 444–480).
- **Endpoint**: `${ollamaUrl}/api/chat`
- **Request Body Structure**:
  ```json
  {
    "model": "llama3",
    "messages": [
      { "role": "system", "content": "You are an email classifier for an HR recruitment platform. Classify the email into exactly one category. Respond with valid JSON only." },
      { "role": "user", "content": "<Classify this email into exactly one category... Email metadata + 500-char bodySnippet...>" }
    ],
    "stream": false,
    "format": "json",
    "options": {
      "temperature": 0.1,
      "num_ctx": 2048,
      "num_predict": 256
    }
  }
  ```

### 2. Prompt Size & Compression Analysis
- **Token Count Assessment**:
  - The static system instruction is `134` characters (~30 tokens).
  - The static user prompt template is ~250 characters (~60 tokens).
  - The dynamic content has a strict upper bound because the email body is truncated to 500 characters: `const bodySnippet = (body || '').substring(0, 500);`
  - Total prompt length (characters): ~900 characters maximum, translating to **~225–240 tokens**.
- **Assessment**: The prompt is well below the `800` tokens threshold specified in `AGENTS.md`. The truncation of the email body to 500 characters acts as an excellent, built-in prompt compression strategy.
- **Further Compression Proposal**:
  To minimize prompt pre-processing latency on local CPUs/GPUs, we can condense the static text of the instructions:
  - **Proposed System Instruction**: `"HR email classifier. Respond in valid JSON only."` (saves ~15 tokens).
  - **Proposed User Prompt Template**:
    ```
    Classify email. Categories: Resume, HR, Spam, Client, Interview, Notification, Other.
    Subj: ${subject || '(No Subject)'}
    From: ${from || 'Unknown'}
    Attach: ${hasAttachments ? 'Yes' : 'No'}
    Body: ${bodySnippet}
    JSON: { "category": "<category>", "confidence": 0.0, "reasoning": "" }
    ```
    This removes verbose structural filler, saving ~40 additional tokens, and reducing overall pre-processing overhead.

### 3. Parameters & AGENTS.md Rules Alignment
- **`num_ctx` & `num_predict`**: The values `num_ctx: 2048` and `num_predict: 256` are explicitly set. This **fully aligns** with the `AGENTS.md` rule:
  > *Simple classification/indexing: `num_ctx: 2048`, `num_predict: 256`*
- **Timeout**: The network request uses a `180000` ms (180s) timeout wrapper. This is appropriate for handling slower local model initialization or concurrent load queues.
- **JSON Format Resilience**: The integration uses `safeExtractAndParseJson(...)` (lines 221-251), which incorporates robust bracket-matching regexes, string escaping, control character sanitization, and fallback options. This is highly resilient to syntax formatting errors characteristic of local models.

---

## Detailed Audit: `server/embeddingService.js`

### 1. Ollama Call Location & Prompt Structure
- **File & Line**: `server/embeddingService.js` (lines 109–132).
- **Endpoint**: `${ollamaUrl}/api/embed`
- **Request Body Structure**:
  ```json
  {
    "model": "nomic-embed-text",
    "input": [ ...array of texts... ]
  }
  ```
  *(Note: There is no prompt template; raw chunk text is sent directly for embedding).*

### 2. Input Size & Compression Analysis
- **Text Chunking**: Document chunking is handled in `server/ragService.js` (lines 56–151). The candidate resumes are split into semantic parts: contact info, skills, education, individual experience entries, and a candidate summary.
- **Token Count Assessment**:
  - Most experience and education chunks are small (<200 tokens).
  - The summary chunk utilizes the first 2000 characters of the candidate's resume: `candidate.resumeText.substring(0, 2000)` (~500 tokens).
  - As separate inputs, they are below the `800` tokens threshold.
- **Batching Bottleneck**:
  - `embedTexts(texts)` aggregates chunks and processes them in batches of 100 (`const BATCH_SIZE = 100;`).
  - If a candidate profile generates 15 chunks (which is common for detailed resumes), and several candidates are indexed, a single batch of 100 chunks containing up to 50,000 tokens is dispatched to Ollama.
  - Dispatched locally, this batch volume can overload the GPU VRAM or CPU RAM, causing long delays, socket timeouts, or Out-Of-Memory crashes.

### 3. Parameters & AGENTS.md Rules Alignment
- **`num_ctx`**: **Missing**. The options block is absent. This violates the AGENTS.md rule requiring explicit parameter configuration. Without configuring `num_ctx`, Ollama defaults to the model's internal or server-wide default context limit. If a very long query or document is sent, silent truncation will occur.
- **`num_predict`**: Omitted, which is correct for embeddings because embedding models do not predict/generate tokens.
- **Timeout**: Set to `180000` ms (180s), which is reasonable given local batch processing times.

### 4. Configuration Conflict (Critical Finding)
- In `server/models.js`, the schema for system settings only tracks `ollamaModel` (defaulting to `'llama3'`).
- In `server/embeddingService.js`, line 111 resolves the model name using:
  `const ollamaModel = settings?.ollamaModel || 'nomic-embed-text';`
- If an administrator configures settings in the DB, `settings?.ollamaModel` resolves to `'llama3'`.
- As a result, the embedding service will send requests to `/api/embed` requesting the `'llama3'` model. Llama 3 is a generative model and is not designed to produce embedding vectors in the `/api/embed` format, leading to connection/request failures.

---

## Proposals and Action Plan

### 1. Resolve Settings Model Conflict
Modify `server/models.js` and settings endpoints to add a separate configuration field for the embedding model:
- Add `ollamaEmbeddingModel: { type: String, default: 'nomic-embed-text' }` to the `Settings` schema.
- Update `server/embeddingService.js` to read:
  ```javascript
  const ollamaModel = settings?.ollamaEmbeddingModel || 'nomic-embed-text';
  ```

### 2. Implement Explicit Parameter Tuning in `embeddingService.js`
Modify the `embedViaOllama` function to explicitly supply `options` in the payload:
```javascript
const response = await fetchWithTimeout(`${ollamaUrl}/api/embed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: ollamaModel,
    input: texts,
    options: {
      num_ctx: 8192 // Ensure full context size is allocated for embedding models
    }
  })
}, 180000);
```

### 3. Implement Dynamic Batch Sizing for Ollama Embeddings
In `server/embeddingService.js`'s `embedTexts`, decouple the batch size from a hardcoded `100` and use a resource-safe value for local Ollama deployments:
```javascript
const BATCH_SIZE = provider === 'ollama' ? 10 : 100;
```
Processing in smaller batches of 10 for Ollama distributes the local execution load, prevents VRAM spikes, and increases system responsiveness.

### 4. Condense Email Classification Prompts
Update `server/emailCategorizer.js` with condensed static instructions and prompt labels:
- **System Instruction**: `"You are an HR email classifier. Respond with valid JSON only."`
- **User Prompt**:
  ```javascript
  const prompt = `Classify this email.
Categories: Resume, HR, Spam, Client, Interview, Notification, Other

Subject: ${subject || '(No Subject)'}
From: ${from || 'Unknown'}
Has Attachments: ${hasAttachments ? 'Yes' : 'No'}
Body: ${bodySnippet}

JSON: { "category": "<one of the categories>", "confidence": <0-1>, "reasoning": "<short reason>" }`;
  ```
