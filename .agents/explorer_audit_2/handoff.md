# Handoff Report — Ollama Setup Optimization Explorer Audit 2

This report details the audit of `server/emailCategorizer.js` and `server/embeddingService.js` to identify Ollama integration points, prompt sizes, parameters alignment, and propose optimizations.

## 1. Observation

Direct observations from the audited codebases:

### A. Email Categorization (`server/emailCategorizer.js`)
- **Ollama Call Location**: Inside `callAIProviderForClassification` (lines 444–480):
  ```javascript
  } else if (aiProvider === 'ollama') {
    const ollamaUrl = (settings?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const ollamaModel = settings?.ollamaModel || 'llama3';
    // ...
    const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }, 180000);
  ```
- **Ollama Request Options**: Sets `num_ctx` and `num_predict` in request body options (lines 456–460):
  ```javascript
  options: {
    temperature: 0.1,
    num_ctx: 2048,
    num_predict: 256
  }
  ```
- **Prompt Structure & Truncation**: System instruction is defined on line 491, and user prompt is on lines 495–505. Truncation is applied on line 493:
  ```javascript
  const bodySnippet = (body || '').substring(0, 500);
  ```

### B. Embedding Service (`server/embeddingService.js`)
- **Ollama Call Location**: Inside `embedViaOllama` (lines 109–132):
  ```javascript
  async function embedViaOllama(texts, settings) {
    const ollamaUrl = (settings?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const ollamaModel = settings?.ollamaModel || 'nomic-embed-text';

    const response = await fetchWithTimeout(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        input: texts
      })
    }, 180000);
  ```
- **Ollama Options**: There is **no `options` block (including `num_ctx`) passed in the body** of the `/api/embed` request.
- **Batching**: Hardcoded batching in `embedTexts` on lines 248–252:
  ```javascript
  const BATCH_SIZE = 100;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
  ```
- **DB Settings & Model Conflict**: In `server/models.js` line 110, settings default to:
  ```javascript
  ollamaModel: { type: String, default: 'llama3' },
  ```
  In `server/embeddingService.js` line 111, model resolution falls back to:
  ```javascript
  const ollamaModel = settings?.ollamaModel || 'nomic-embed-text';
  ```

---

## 2. Logic Chain

1. **Email Categorizer Parameters**: The code uses `num_ctx: 2048` and `num_predict: 256` for classification, which matches the simple classification rule from `AGENTS.md`. The timeout is `180000` ms, preventing premature timeouts.
2. **Email Categorizer Prompt Size**: The prompt size is ~240 tokens due to truncation of the body to 500 characters, which is well below the `800` tokens limit from `AGENTS.md`.
3. **Embedding Parameters Violation**: `embeddingService.js` lacks an `options` block in `/api/embed`. This violates the `AGENTS.md` rule requiring explicit configuration of context size (`num_ctx`) for all Ollama tasks.
4. **Embedding Batch Overload**: Embedding batches of 100 chunks at once on a local Ollama instance can cause severe CPU/GPU spikes, potentially leading to VRAM OOM errors or timeouts. Decatur-based batch sizes like `10` for local setups mitigate this.
5. **Config Conflict**: The settings DB schema defines `ollamaModel` which defaults to `'llama3'`. The embedding service reads this configuration field to override `'nomic-embed-text'`. Since Llama 3 is a chat model, calling `/api/embed` with it will cause failure or produce garbage embeddings.

---

## 3. Caveats

- We did not verify the actual runtime of the Ollama server locally because this is a read-only investigation.
- We assumed standard local CPU/GPU hardware limitations as the rationale for dynamic batch sizing.

---

## 4. Conclusion

1. **`emailCategorizer.js`** is fully compliant with the prompt sizes and parameters in `AGENTS.md`.
2. **`embeddingService.js`** violates `AGENTS.md` by omitting `num_ctx` in `/api/embed` calls.
3. A critical config conflict exists where the DB's `ollamaModel` configuration overrides the default embedding model (`nomic-embed-text`) with a chat model (`llama3`).
4. Propose separate embedding model configs in the DB, reducing the embedding batch size to `10` for Ollama, and adding the `options.num_ctx: 8192` block to `/api/embed` requests.

---

## 5. Verification Method

- **Files to Inspect**:
  - `server/emailCategorizer.js` (lines 456-460 for parameters, line 493 for body snippet truncation).
  - `server/embeddingService.js` (lines 113-120 for missing options block, lines 248-251 for batch size).
  - `server/models.js` (line 110 for `ollamaModel` definition).
- **Test Command**:
  - Ensure Vitest runs correctly on the test suite using `npm run test:run` inside the `server/` directory.
