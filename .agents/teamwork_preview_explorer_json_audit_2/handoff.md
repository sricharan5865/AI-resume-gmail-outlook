# JSON Parsing Vulnerability Audit Report

## 1. Observation

A detailed audit of `server/emailCategorizer.js` and `server/embeddingService.js` revealed multiple JSON parsing vulnerabilities and fragile integration patterns related to the local Ollama LLM and other AI providers.

### `server/emailCategorizer.js`

*   **Observation 1.1: Direct usage of `JSON.parse` on chat responses.**
    *   **Locations:**
        *   Line 82 (OpenRouter): `return JSON.parse(cleanJsonResponse(text));`
        *   Line 112 (Gemini native): `return JSON.parse(text);`
        *   Line 146 (OpenAI): `return JSON.parse(cleanJsonResponse(text));`
        *   Line 178 (Claude): `return JSON.parse(cleanJsonResponse(text));`
        *   Line 211 (Ollama): `return JSON.parse(cleanJsonResponse(text));`
    *   **Verbatim Code:**
        ```javascript
        208:     const result = await response.json();
        209:     const text = result.message?.content;
        210:     if (!text) throw new Error('Ollama API returned an empty response.');
        211:     return JSON.parse(cleanJsonResponse(text));
        ```

*   **Observation 1.2: Fragile markdown backtick cleaning and no conversational text trimming.**
    *   **Location:** Lines 6–29 (`cleanJsonResponse` function)
    *   **Verbatim Code:**
        ```javascript
        6: function cleanJsonResponse(text) {
        7:   let clean = text.trim();
        8:   if (clean.startsWith('```json')) {
        9:     clean = clean.substring(7);
        10:   } else if (clean.startsWith('```')) {
        11:     clean = clean.substring(3);
        12:   }
        13:   if (clean.endsWith('```')) {
        14:     clean = clean.substring(0, clean.length - 3);
        15:   }
        ...
        ```
    *   **Behavior:** This code assumes backticks appear only at the absolute start/end of the trimmed text. If the model prefixes the response with conversational filler (e.g., `"Sure! Here is the JSON: \`\`\`json ... \`\`\`"`), the cleaning fails, leaving the outer text intact and causing `JSON.parse` to crash.

*   **Observation 1.3: No handling of truncated JSON or partial property extraction.**
    *   **Behavior:** If the model response exceeds token limits and truncates, `JSON.parse` throws. No attempt is made to salvage partially formed attributes (e.g. using regex pattern matches).

*   **Observation 1.4: Missing HTTP Request Timeouts and Retries.**
    *   **Locations:** Lines 98–102 (Gemini), Lines 129–136 (OpenAI), Lines 160–168 (Claude), and Lines 197–201 (Ollama).
    *   **Behavior:** Fetch operations are initiated without `signal` (AbortController) or timeouts. A hung local Ollama instance (common during cold start or resource contention) will block the server execution thread indefinitely. Unlike the embedding service, there is no request retry loop.

---

### `server/embeddingService.js`

*   **Observation 1.5: Unsafe property access on parsed API responses.**
    *   **Locations:**
        *   Line 88 (Ollama): `if (!result.embeddings || !Array.isArray(result.embeddings))`
        *   Line 152 (OpenRouter): `if (!result.data || !Array.isArray(result.data))`
        *   Line 190 (Gemini): `return result.embeddings.map(e => e.values);`
    *   **Verbatim Code (Gemini):**
        ```javascript
        189:   const result = await response.json();
        190:   return result.embeddings.map(e => e.values);
        ```
    *   **Behavior:** If the API response body is `null` or a primitive, accessing properties like `result.embeddings` will throw a `TypeError`. In the Gemini case, if `embeddings` is undefined or omitted (e.g., due to an API error response with status 200 containing error details), calling `.map()` will result in `TypeError: Cannot read properties of undefined (reading 'map')`, crashing the caller.

*   **Observation 1.6: Reading response body as JSON without MIME-type validation.**
    *   **Locations:** Line 87 (Ollama), Line 151 (OpenRouter), Line 189 (Gemini)
    *   **Verbatim Code (Ollama):**
        ```javascript
        87:   const result = await response.json();
        ```
    *   **Behavior:** If the server returns a non-JSON error (e.g., an HTML error page from a gateway timeout or proxy 502/504), calling `response.json()` causes a parser crash (`SyntaxError: Unexpected token < in JSON at position 0`).

*   **Observation 1.7: Missing request timeouts in embedding operations.**
    *   **Behavior:** Embedding fetch calls lack timeout protections.

---

## 2. Logic Chain

1.  **Vulnerability Propagation:** Direct use of `JSON.parse` (Observation 1.1) and `response.json()` (Observation 1.6) without sanitization and structure validation means any unexpected or malformed API output leads to thrown JS exceptions.
2.  **Cascading Failures:**
    *   In `emailCategorizer.js`, any parsing exception causes the entire categorization to fail. Although caught in `categorizeEmail` (falling back to `'Other'`), it degrades the system's accuracy and fails to log the raw payload that caused the failure, hindering debugging.
    *   In `embeddingService.js`, if `response.json()` throws or if `result.embeddings` is missing (causing a `TypeError` in `.map()`), the error propagates through `withRetry`. Once all 3 retries are exhausted, it throws an unhandled rejection inside the calling code. When uploading a candidate, this causes a complete failure of the resume ingestion process.
3.  **Local LLM Characteristics:** Local models (like Ollama Llama3) are highly prone to formatting drift (returning markdown or chat commentary) and latency spikes (leading to connection timeouts). The lack of input-tolerant parsers (Observation 1.2, 1.3) and timeouts (Observation 1.4, 1.7) will cause the application to hang or fail regularly when Ollama is selected.

---

## 3. Caveats

*   **Scope:** This is a read-only investigation. No modifications have been made to the codebase.
*   **Gemini Parser:** During the audit, similar direct `JSON.parse` and API response formatting vulnerabilities were noticed in `server/geminiParser.js` (e.g., line 423/438). While out of scope for the strict request, they present the same vulnerability profiles and should be fixed using the same proposed strategies.

---

## 4. Conclusion

The codebase is highly vulnerable to format and network-level anomalies from local Ollama integrations. A robust fix strategy requires implementing defensively designed helpers that sanitize raw LLM outputs, repair/fallback on partial JSON, safely parse response payloads, and enforce request timeouts.

### Proposed Fix Strategy

#### Step 1: Implement `safeExtractAndParseJson` in `server/emailCategorizer.js`
Replace the primitive `cleanJsonResponse` and direct `JSON.parse` calls with a resilient extraction parser:

```javascript
function safeExtractAndParseJson(text, fallback) {
  if (!text || typeof text !== 'string') return fallback;

  // 1. Clean markdown formatting
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  cleaned = cleaned.trim();

  // 2. Extract JSON block from conversational preambles/postambles
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  // 3. Sanitize raw control characters in string literals
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, (char) => {
        return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
      });
  });

  // 4. Try parsing
  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.error('JSON Parse failed. Raw response:', text);
    console.error('Cleaned chunk:', cleaned);

    // 5. Last resort: regex property extraction for truncated/malformed JSON
    const categoryMatch = cleaned.match(/"category"\s*:\s*"([^"]+)"/);
    const confidenceMatch = cleaned.match(/"confidence"\s*:\s*([0-9.]+)/);
    const reasoningMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]+)"/);

    const extracted = {};
    if (categoryMatch) extracted.category = categoryMatch[1];
    if (confidenceMatch) extracted.confidence = parseFloat(confidenceMatch[1]);
    if (reasoningMatch) extracted.reasoning = reasoningMatch[1];

    if (extracted.category || extracted.confidence !== undefined) {
      console.warn('Recovered partial fields using regex extraction:', extracted);
      return {
        category: extracted.category || fallback.category,
        confidence: extracted.confidence !== undefined ? extracted.confidence : fallback.confidence,
        reasoning: extracted.reasoning || fallback.reasoning
      };
    }

    return fallback;
  }
}
```

#### Step 2: Implement Request Timeouts
Add a timeout helper or integrate `AbortController` in all `fetch` request options:
```javascript
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### Step 3: Implement Safe Response JSON Parser for Embeddings
For `server/embeddingService.js`, introduce a wrapper to safely parse JSON response streams and validate data types:
```javascript
async function safeParseResponseJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Expected JSON response but got "${contentType}". Body: ${text.substring(0, 150)}`);
  }
  try {
    const data = await response.json();
    if (!data) throw new Error('Response parsed to null/undefined');
    return data;
  } catch (err) {
    throw new Error(`Failed to parse response body as JSON: ${err.message}`);
  }
}
```
Apply this inside `embedViaOllama`, `embedViaOpenRouter`, and `embedViaGemini`, and explicitly validate the properties array structure before indexing.

---

## 5. Verification Method

To verify these vulnerabilities independently and confirm the efficacy of the proposed strategies:

1.  **Run current E2E Tests:**
    Ensure existing tests pass:
    ```bash
    cd server
    npm run test:e2e
    ```
2.  **Introduce Vulnerability Test Cases:**
    Create a mock server endpoint (e.g. in `tests/e2e/testServerEntry.js`) mimicking the following Ollama failures:
    *   **Conversational prefix:** Returns `"Here is the category data: {\"category\": \"Resume\", \"confidence\": 0.9, \"reasoning\": \"ok\"}"`.
    *   **Truncated JSON:** Returns `{"category": "Resume", "confidence": 0.9, "reasoni` (incomplete key/value).
    *   **Invalid content-type:** Returns a `502 Bad Gateway` HTML page with status `200` (e.g., from an upstream reverse proxy).
    *   **Request Hang:** Simulates a delay exceeding the timeout parameter.
3.  **Validate Fallbacks:**
    *   Verify that `emailCategorizer.js` resolves to the default object `{ category: 'Other', confidence: 0, reasoning: 'Classification failed' }` or successfully parses the category using the regex extractor, rather than throwing uncaught errors.
    *   Verify that `embeddingService.js` correctly retries or aborts the request via `AbortController` rather than hanging the server process.
