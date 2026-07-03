# Performance Audit Handoff Report — Ollama & Mongoose Investigation

## 1. Observation

### Ollama Integration Points
I identified four primary code locations interacting with Ollama APIs:

1. **Email Categorization (`server/emailCategorizer.js` lines 444–480):**
   * **URL:** `${ollamaUrl}/api/chat`
   * **Timeout:** Hardcoded to `30000` ms (30 seconds) in `fetchWithTimeout`:
     ```javascript
     const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(requestBody)
     }, 30000);
     ```
   * **Parameters:** Hardcoded to very large resource windows:
     ```javascript
     options: {
       temperature: 0.1,
       num_ctx: 32768,
       num_predict: 8192
     }
     ```
   * **Validation:** Uses `safeExtractAndParseJson(text, emailCategorySchema, emailCategoryFallback)` to extract and validate JSON.

2. **Resume Chunk Embeddings (`server/embeddingService.js` lines 109–132):**
   * **URL:** `${ollamaUrl}/api/embed`
   * **Timeout:** Hardcoded to `30000` ms (30 seconds):
     ```javascript
     const response = await fetchWithTimeout(`${ollamaUrl}/api/embed`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         model: ollamaModel,
         input: texts
       })
     }, 30000);
     ```
   * **Validation:** Uses `safeParseResponseJson` to verify JSON content-type and checks that `result.embeddings` is an array.

3. **Resume Parsing & Q&A (`server/geminiParser.js` lines 564–643):**
   * **URL:** `${ollamaUrl}/api/chat`
   * **Timeout:** Hardcoded to `900000` ms (15 minutes).
   * **Parameters:** Hardcoded context and predict limits:
     ```javascript
     options: {
       temperature: 0.1,
       num_ctx: 16384,
       num_predict: 8192
     }
     ```
     On truncated JSON detection, it retries once with `num_predict: 16384`.
   * **Validation:** Uses `safeExtractAndParseJson(text, schema)` and contains logic to check if JSON is truncated.

4. **Connection Test Endpoint (`server/server.js` lines 479–495):**
   * **URL:** `${ollamaUrl}/api/tags`
   * **Timeout:** No timeout wrap at all (uses standard node-fetch):
     ```javascript
     const response = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/tags`);
     ```

---

### Mongoose Queries, Updates, and Schema Setup
1. **Deprecation Check (`new: true` vs `returnDocument: 'after'`):**
   * I ran a regex search for `new: true` and found zero occurrences in the active server codebase.
   * All `findOneAndUpdate` calls in `server/server.js` use the modern MongoDB driver equivalent option `{ returnDocument: 'after' }`:
     * Line 1835: `Candidate.findOneAndUpdate(..., { returnDocument: 'after' })`
     * Line 1888: `Job.findOneAndUpdate(..., { returnDocument: 'after' })`
     * Line 1940: `Settings.findOneAndUpdate(..., { returnDocument: 'after', upsert: true })`
     * Line 2033: `Settings.findOneAndUpdate(..., { returnDocument: 'after', upsert: true })`
2. **Duplicate Candidate Resolution Flow:**
   * Handled in `server/server.js` under route `/api/candidates/upload/resolve` (lines 1337–1688).
   * It correctly supports four actions:
     * `update` (Option 1 - Overwrite Existing Candidate)
     * `delete-before` (Option 2 - Delete Old & Import New)
     * `remove` (Option 3 - Delete Old Only & Halt Import)
     * Fallback/else block (Option 4 - Discard Uploaded File/Cancel)
3. **Database Performance Bottlenecks:**
   * In `server/models.js`, the Candidate Schema (`candidateSchema`) has no indexes for `jobId` or `assignedTo`. These fields are queried frequently (e.g. `Candidate.find({ assignedTo: req.user.email })` on line 1696 of `server.js`).

---

### Test Infrastructure & Commands
* **Location:** `tests/e2e/` (contains 4 main spec files: `combinations.test.js`, `regenerateQuestions.test.js`, `resumeUpload.test.js`, `scenarios.test.js`).
* **Test Runner:** Vitest + `start-server-and-test`.
* **Execution Commands (from `server/package.json`):**
  * `npm run test:e2e` (Starts server mock entry and runs tests)
  * `npm run test:run` (Runs Vitest configuration alone against an already active test server)

---

## 2. Logic Chain

1. **Premature Timeouts:** Local Ollama instances (especially running on CPU or sharing VRAM with OS/other tools) often experience cold start times when loading new model files. A hardcoded 30-second timeout on classification (`emailCategorizer.js`) and embedding (`embeddingService.js`) will result in premature HTTP 504 errors when the model needs to spin up or is under concurrency load.
2. **Suboptimal Model Parameters:** The context window of `32768` and output tokens limit of `8192` in `emailCategorizer.js` are highly inefficient. Because the email snippet is truncated to 500 characters, a context size of `2048` and prediction limit of `256` tokens are more than sufficient. Restricting these saves considerable VRAM and reduces generation latency on the local host.
3. **Hanging Test Connections:** The `/api/ollama/test-connection` endpoint uses standard `fetch` with no timeout. If the target URL is invalid or unresponsive, the request can hang indefinitely, locking sockets or blocking frontend requests. Adding a 5–10 second timeout solves this.
4. **Mongoose Indexes:** As MongoDB databases grow, querying unindexed fields requires scanning the entire candidate collection. Indexes on `jobId` and `assignedTo` are highly recommended for performant filtering.
5. **Test Failure Context:** Attempting to run the E2E tests locally resulted in a Mongoose connection timeout (`buffering timed out after 10000ms`) because the local Docker daemon and MongoDB services are not currently active on this system.

---

## 3. Caveats

* The test suite could not be verified in a green/passing state due to the inactive local MongoDB service.
* I assumed default local LLM (Ollama) behavior which matches GPU-constrained environments, leading to the VRAM/timeout recommendations.

---

## 4. Conclusion

1. **Ollama Integration:** The 30s timeouts on classification and embeddings must be increased (e.g. to 120s or 180s) to prevent cold-start 504 errors. Email categorization request parameters should be downscaled (`num_ctx: 2048`, `num_predict: 256`) to save VRAM and latency.
2. **Mongoose Queries:** The codebase is fully up to date on `returnDocument: 'after'` deprecation rules. However, database performance can be optimized by adding indexes to `jobId` and `assignedTo` in `server/models.js`.
3. **E2E Tests:** Run `npm run test:e2e` from `server/` to execute the Vitest test suite once MongoDB is active.

---

## 5. Verification Method

To verify these findings:
1. View `server/emailCategorizer.js` (lines 456-467) to confirm parameters and the 30000ms timeout.
2. View `server/embeddingService.js` (line 120) to confirm the 30000ms timeout.
3. View `server/server.js` (line 486) to confirm the lack of a timeout wrapper on the `/api/ollama/test-connection` route.
4. View `server/models.js` (lines 3-68) to verify that `jobId` and `assignedTo` lack schema indexes.
5. Ensure a local MongoDB instance is active, then navigate to `server/` and run `npm run test:e2e` to verify the test suite execution.
