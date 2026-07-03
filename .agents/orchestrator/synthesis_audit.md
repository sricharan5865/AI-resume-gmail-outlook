# Codebase Audit Synthesis: JSON integrity & Ollama Hardening

This report aggregates the findings from 3 parallel codebase audits (Explorer 1, Explorer 2, and Explorer 3) and specifies the consolidated action plan to harden the local Ollama LLM integration, email categorizer, embedding service, settings endpoints, and client-side storage.

## Identified Vulnerabilities & Gaps

### 1. Resume Parser (`server/geminiParser.js`)
* **Fragile JSON Parsing**: `safeParseJson` parses `cleanedText` directly and rethrows any parsing exception, which aborts the candidate ingestion flow (manual upload or email) and returns an HTTP 500 error.
* **No Cleaning in Native Gemini**: Bypasses the `cleanJsonResponse` helper, calling `safeParseJson(text, text)` directly. This crashes on markdown fencers.
* **Brittle Truncation Logic**: Checks for specific V8 error messages (`Unterminated` or `Unexpected end`) to trigger retry. No retry if other errors occur, and no fallback to defaults if retry also fails.
* **Restrictive Ollama Context/Token Limits**: Ollama defaults to a small context size (`num_ctx: 2048`), which truncates long resumes at input time. Output limit (`num_predict`) is restricted and can truncate output.

### 2. Email Categorizer (`server/emailCategorizer.js`)
* **Fragile JSON Cleaning**: `cleanJsonResponse` expects markdown fences only at the extreme start/end of the string. If conversational text wraps the block, it fails.
* **Unprotected Parsing**: Direct `JSON.parse` is used for all LLM providers (including Ollama). An exception crashes the categorization stream.
* **Lack of Timeouts**: No timeouts are set on Ollama/external fetch requests, which can hang the backend if the local LLM becomes unresponsive.

### 3. Embedding Service (`server/embeddingService.js`)
* **Unsafe Object Property Access**: Accesses `result.embeddings.map` directly. If the embedding array is missing or the response is not valid JSON, it throws `TypeError` or `SyntaxError`, crashing the candidate saving pipeline.
* **Lack of Response MIME-Type Validation**: Calls `response.json()` without checking if the response is `application/json`, which crashes on proxy HTML error pages.
* **Lack of Timeouts**: No timeouts are set on embedding fetches.

### 4. Express Endpoints (`server/server.js`)
* **Unhandled Promise Rejections**: `/api/settings` and `/api/settings/tag-preferences` run async database operations without `try-catch` blocks.
* **Missing Input Validation**: `/api/candidates/upload/resolve` uses `parsedData` keys (e.g. `parsedData.name`) directly, risking `TypeError` crashes if `parsedData` is undefined or malformed.

### 5. Client-side LocalStorage (`client/src/App.jsx` & `components/RAGSearch.jsx`)
* **UI White-Screen Risks**: Directly calls `JSON.parse(localStorage.getItem('user'))` and `JSON.parse(localStorage.getItem(HISTORY_KEY))` without `try-catch` guards. If localStorage is corrupted, the entire React application crashes.

---

## Action Plan (Consolidated Fixes)

### 1. Robust JSON Parsing Utilities (`server/geminiParser.js` & `server/emailCategorizer.js`)
* Create `safeExtractAndParseJson(text, schema, fallback)`:
  * Extract the JSON substring using matching braces `{}` or brackets `[]` (resilient to preambles/postambles).
  * Clean control characters in string literals (replace raw newlines/tabs with escaped equivalents `\n`, `\t`).
  * Attempt standard parsing.
  * If standard parsing fails, perform stateful repair (closing open brackets, strings, and truncating dangling commas/colons).
  * Merge with schema defaults recursively to guarantee downstream property access never crashes.

### 2. Lifing Ollama Restrictive Limits
* Update Ollama request options for resume parsing and email categorization:
  * Set `num_ctx: 32768` (or `65536`) to ensure the entire resume text and schema fit in context.
  * Set `num_predict: 32768` (with fallback retry setting it to `65536`) or `-1` to prevent output truncation.
  * Apply this change uniformly across all operations regardless of triggering user role.

### 3. Safe HTTP Requests with Timeouts
* Create `fetchWithTimeout(url, options, timeoutMs)` using `AbortController` and integrate it into all Ollama, Gemini, Claude, and OpenAI API calls (email categorization, embedding, parsing).
  * Email categorization timeout: 30 seconds.
  * Embedding timeout: 30 seconds.
  * Resume parsing timeout: 5 minutes.

### 4. Safe Response Parsing in Embedding Service
* Implement `safeParseResponseJson(response)`:
  * Validate `content-type` is `application/json`.
  * Guard all map and property access operations (e.g., check `Array.isArray(result.embeddings)` before mapping).

### 5. Endpoint Hardening in `server.js`
* Wrap all operations in settings endpoints in `try-catch` and return appropriate status codes.
* Validate `parsedData` is an object in `/api/candidates/upload/resolve`.

### 6. Guard Client localStorage Parsing
* Wrap localStorage `JSON.parse` in client code with a safe helper that returns a fallback value.
