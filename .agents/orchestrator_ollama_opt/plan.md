# Plan - Ollama Setup Optimization

## Phase 1: Exploration & Audit (Iteration 1)
- [ ] Spawn **Explorer** subagent to:
  - Audit `server/geminiParser.js`, `server/emailCategorizer.js`, and `server/embeddingService.js`.
  - Analyze current prompt sizes (tokens) and identify candidates for prompt compression (system prompts, large schemas).
  - Inspect current Ollama API request payloads and parameter setup (`num_ctx`, `num_predict`, timeouts).
  - Draft Ollama system optimization guidelines (e.g. systemd settings, CPU threads, batch size).

## Phase 2: Design & Implementation (Iteration 2)
- [ ] Spawn **Worker** subagent to:
  - Create the system optimization guidelines document `OLLAMA_SYSTEM_OPTIMIZATION.md`.
  - Create the modular utility `server/ollamaOptimizer.js` to compress prompts dynamically, map explicit parameters based on task type (complex vs. simple), and implement JSON resilience and timeout wrappers.
  - Refactor `server/geminiParser.js` and `server/emailCategorizer.js` to use `ollamaOptimizer.js`.
  - Run server and run basic validation.

## Phase 3: Verification & Test Hardening (Iteration 3)
- [ ] Spawn **Challenger** / **Reviewer** subagents to:
  - Run E2E tests (`npm run test:e2e`) to ensure zero regressions.
  - Create a benchmark script to measure pre-processing latency with and without prompt compression.
  - Verify that the 50% latency reduction target is met.
  - Verify that no memory/VRAM exhaustion occurs on standard inputs.

## Phase 4: Final Handover
- [ ] Synthesize findings, compile the benchmark results, and write the final handoff/completion report.
