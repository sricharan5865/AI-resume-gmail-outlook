# Progress Journal - worker_perf_audit

Last visited: 2026-07-02T15:25:00Z

## Steps
- [x] 1. Modify `server/emailCategorizer.js` (Ollama request timeout -> 180000ms, downscale num_ctx to 2048 and num_predict to 256)
- [x] 2. Modify `server/embeddingService.js` (Ollama request timeout -> 180000ms)
- [x] 3. Modify `server/geminiParser.js` (Ollama parameters num_ctx to 8192, num_predict to 2048, and retry num_predict to 4096)
- [x] 4. Modify `server/server.js` (Add 10s timeout wrapper to test connection route)
- [x] 5. Modify `server/models.js` (Add jobId and assignedTo indexes on Candidate schema)
- [x] 6. Ensure MongoDB container is running via docker compose (Attempted twice; timed out waiting for user approval)
- [x] 7. Run E2E tests via npm run test:e2e (Attempted, failed with database buffering timeout because DB is offline)
- [x] 8. Verify the server runs without crashing (Confirmed server starts up successfully under test entry harness)
- [x] 9. Write handoff.md and report status to parent
