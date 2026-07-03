# JSON Audit Handoff Report: server/geminiParser.js

## 1. Observation
We audited the file `server/geminiParser.js` to identify potential JSON parsing vulnerabilities. Below are the key locations and code segments identified:

### Location 1: safeParseJson function (Lines 74–83)
```javascript
function safeParseJson(text, cleanedText) {
  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('GeminiParser: JSON parsing failed.');
    console.error('Raw response text:', text);
    console.error('Cleaned text tried to parse:', cleanedText);
    throw error;
  }
}
```
- **Vulnerability**: Direct usage of `JSON.parse` with no recovery. If `JSON.parse` fails, the exception is caught, logged to console, and then immediately **rethrown** (`throw error;`). This causes the caller functions (`parseResume`, `scoreCandidate`, etc.) and ultimately the API routes/email pollers in `server/server.js` to fail with unhandled 500 server errors, aborting the entire ingestion process.

### Location 2: Gemini Native Integration (Lines 203–210)
```javascript
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini API returned an empty response.');
      }

      return schema ? safeParseJson(text, text) : text;
```
- **Vulnerability**: Bypasses `cleanJsonResponse` entirely. It calls `safeParseJson(text, text)` directly. If the Gemini model returns markdown code fences (e.g., ` ```json ... ``` `), leading/trailing text, or unescaped control characters, the parse will immediately fail and crash.

### Location 3: Ollama Retry Logic (Lines 420–435)
```javascript
    // Detect truncated JSON: if we expected JSON but the response is cut off, retry once with higher limit
    if (schema) {
      try {
        const testClean = cleanJsonResponse(text);
        JSON.parse(testClean);
      } catch (truncErr) {
        if (truncErr.message.includes('Unterminated') || truncErr.message.includes('Unexpected end')) {
          console.warn('Ollama: Response appears truncated, retrying with extended token limit...');
          requestBody.options.num_predict = 65536;
          result = await ollamaFetch(requestBody);
          text = result.message?.content;
          if (!text) {
            throw new Error('Ollama API returned an empty response on retry.');
          }
        }
      }
    }
```
- **Vulnerability**: The truncation check relies on specific V8 error messages (`Unterminated` or `Unexpected end`), which are environment-dependent. If the first try fails due to syntax errors (e.g., unescaped quotes), it retries, but if the second try also fails parsing, `safeParseJson` will throw and fail the entire process. Furthermore, there is no timeout protection or JSON recovery/repair on the retried content.

### Location 4: Similar Vulnerabilities in `server/emailCategorizer.js` (Lines 82, 112, 146, 178, 211)
- Similar unhandled `JSON.parse` calls on LLM outputs exist in `server/emailCategorizer.js`. Particularly, at line 112, native Gemini bypasses cleaning entirely: `return JSON.parse(text);`. If parsing fails there, it crashes the email categorizer process, halting email polling.

---

## 2. Logic Chain
1. **Observation 1**: The parser uses `JSON.parse` directly inside `safeParseJson` and rethrows all errors.
2. **Observation 2**: API endpoints/email pollers in `server/server.js` call `parseResume` and do not have parsing-level fallbacks; a thrown error terminates the request, resulting in a HTTP 500 error or a failed ingestion log status.
3. **Observation 3**: LLM responses are subject to truncation (when token limits are hit), markdown code fences (which are sometimes not cleanly stripped if wrapped in explanation text), and raw control characters (which standard JSON specs forbid inside string literals).
4. **Observation 4**: Native Gemini calls `safeParseJson(text, text)` with zero cleaning or sanitation.
5. **Conclusion**: Therefore, any malformed, truncated, or markdown-wrapped LLM response will crash the candidate resume parser or classification pipeline, producing a fragile system and poor user experience.

---

## 3. Caveats
- We did not modify the actual codebase in `server/` directly to respect the read-only investigation constraint. The proposed solution is provided as a complete replacement file `proposed_geminiParser.js` within our directory.
- Testing was done on simulated inputs using a local Node script, not against actual live LLM APIs.
- The resilient parser closes trailing structures and truncates unclosed keys to make the JSON valid, which might result in incomplete data (e.g., a candidate profile missing some experience items). This is, however, far better than throwing a 500 error and refusing to import the candidate at all.

---

## 4. Conclusion & Actionable Fix Strategy
We recommend implementing a resilient JSON parsing wrapper. We have designed and verified a 5-step robust fix strategy in `proposed_geminiParser.js`:

1. **Stateful JSON Extraction (`extractJson`)**: Finds the boundary of the JSON object/array using stateful brace/bracket matching, dropping prefix/suffix markdown or conversational text.
2. **Stateful Truncated JSON Repair (`repairTruncatedJson`)**: Scans the extracted string, detects unclosed quotes, keys, arrays, and objects, and closes/recovers them in reverse order (e.g., converting `{"skills": ["React"` into `{"skills": ["React"]}`).
3. **Automatic Schema-Default Generation (`getDefaultsFromSchema`)**: Dynamically extracts type defaults (e.g., `[]` for arrays, `""` for strings) from the provided JSON schema.
4. **Recursive Default Merging (`mergeWithDefaults`)**: Recursively merges the parsed object with the schema's default object, ensuring all expected fields exist with correct data types. This guarantees that downstream code (e.g., `parsedData.skills.forEach(...)`) never crashes due to missing/undefined properties.
5. **Unified Sanitation**: Standardizes the cleaning pipeline across all providers (specifically ensuring native Gemini uses `cleanJsonResponse` before parsing).

The full proposed implementation is written to:
`c:\Users\sri charan\Documents\projects\hr recruter\.agents\teamwork_preview_explorer_json_audit_1\proposed_geminiParser.js`

---

## 5. Verification Method
1. **Verification of parsing helper functions**:
   - Run the validation test suite written in our working directory using:
     ```powershell
     cd "c:\Users\sri charan\Documents\projects\hr recruter\.agents\teamwork_preview_explorer_json_audit_1"
     node test_parser.js
     ```
   - Verify that all test cases (normal JSON, truncated strings, truncated property keys, truncated arrays, and trailing commas) pass successfully and yield valid parsed objects.

2. **Integration verification (for the implementation phase)**:
   - Replace the content of `server/geminiParser.js` with `proposed_geminiParser.js`.
   - Run the server project's standard test command (e.g., `npm test` or `npm run test` if available).
   - Manually test candidate resume uploads using truncated or malformed PDF inputs to verify that the server processes them successfully without throwing 500 errors.
