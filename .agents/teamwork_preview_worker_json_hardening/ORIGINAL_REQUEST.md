## 2026-07-01T18:40:15+05:30
You are teamwork_preview_worker_json_hardening.
Your working directory is: c:\Users\sri charan\Documents\projects\hr recruter\.agents\teamwork_preview_worker_json_hardening

Your task is to implement code hardening for JSON parsing vulnerabilities related to local Ollama integration and local API endpoints across the server and client codebase.

### Mandatory Requirements:
1. Wrap all edits in server-side files (server/geminiParser.js, server/emailCategorizer.js, server/embeddingService.js, server/server.js) and client-side files (client/src/App.jsx, client/src/components/RAGSearch.jsx) following the synthesis report at `c:\Users\sri charan\Documents\projects\hr recruter\.agents\orchestrator\synthesis_audit.md`.
2. Ensure you set token output limits (max_tokens / maxOutputTokens) to at least 8000/8192 for LLMs to prevent token truncation, conforming to AGENTS.md custom rules.
3. Do NOT modify the duplicate candidate resolution options or flow (except to validate input objects).
4. Do NOT prune or delete any web pages or components.

### Verbatim Integrity Instruction:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute the changes, run builds, and run tests via `npm run test:e2e` in `server` directory to confirm that all 27 tests pass successfully. When done, write your handoff report to `c:\Users\sri charan\Documents\projects\hr recruter\.agents\teamwork_preview_worker_json_hardening\handoff.md`.
