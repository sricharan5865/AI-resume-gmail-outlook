## 2026-07-02T15:12:32Z
<USER_REQUEST>
You are a read-only exploration agent. Your working directory is c:\Users\sri charan\Documents\projects\hr recruter\.agents\explorer_perf_audit.
Your mission is to perform a detailed exploration of the codebase as outlined in c:\Users\sri charan\Documents\projects\hr recruter\.agents\explorer_perf_audit\brief.md.
Identify:
1. All Ollama integration points (resume parsing, email categorization, etc.) and check for timeouts, model configurations (num_ctx, num_predict), and validation.
2. All Mongoose queries that use `new: true` or update/create documents. Check for potential deprecations/warnings or structure/performance improvements.
3. The existing tests and the command/runner to run them.
Provide your findings in a structured handoff/analysis report in your working directory and notify me when done.
</USER_REQUEST>
