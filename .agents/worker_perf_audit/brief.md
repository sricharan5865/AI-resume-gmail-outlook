# Worker Brief - Performance Audit Implementation

## Mission
Safely apply code optimizations to Ollama integration settings, add a timeout wrapper to Ollama connection testing, add Candidate schema indexes, and verify that the application builds, all tests pass, and the server runs properly.

## Instructions
1. **Ollama Timeouts:**
   - In `server/emailCategorizer.js` (around line 467): Increase the timeout of the Ollama classification fetch request from `30000` to `180000` (3 minutes) to prevent premature 504 errors on cold starts or under load.
   - In `server/embeddingService.js` (around line 120): Increase the timeout of the Ollama embeddings fetch request from `30000` to `180000` (3 minutes).
   - In `server/server.js` (around line 486): Wrap the `fetch` request in the `/api/ollama/test-connection` endpoint with a timeout (e.g. 10 seconds) to prevent the connection test from hanging indefinitely if the Ollama endpoint is down. You can define a local `fetchWithTimeout` helper similar to the ones in `emailCategorizer.js`.

2. **Ollama Request Parameters:**
   - In `server/emailCategorizer.js` (around line 456): Downscale `num_ctx` to `2048` and `num_predict` to `256` for the Ollama chat options to prevent high latency and VRAM exhaustion (since email category prediction only returns a tiny JSON object).
   - In `server/geminiParser.js` (around line 584): Optimize local Ollama parameters to prevent high latency/VRAM exhaustion by using `num_ctx: 8192` and `num_predict: 2048`. On retry (line 629), set `num_predict` to `4096`.

3. **Mongoose Database & Schema Updates:**
   - In `server/models.js` (around line 68): Add schema indexes to `jobId` and `assignedTo` fields in the `Candidate` schema. You can do this by adding `candidateSchema.index({ jobId: 1 });` and `candidateSchema.index({ assignedTo: 1 });`.
   - Double check that all `findOneAndUpdate` calls in the server use `returnDocument: 'after'` or `returnDocument: 'before'` correctly instead of the deprecated `new` option. Do not introduce any new `new: true` options.

4. **Verification & Execution:**
   - Ensure MongoDB is running. If docker-compose is available, try `docker compose up -d mongodb` or inspect running containers/services.
   - Run Vitest E2E tests: in the `server` directory, run `npm run test:e2e` to verify everything is green.
   - Run the development server and verify that it starts without crashing and functions correctly (as per user custom rule user_global: "Whenever a project or code change is completed, always run it (e.g., start the development server, host the static site, or run the application) to verify that it works properly before ending the task.").

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
