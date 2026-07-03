# Explorer Brief - Performance Audit

## Mission
Investigate the TalentFlow codebase to identify all Ollama integration points and all Mongoose model queries to locate deprecated settings (especially `new: true` vs `returnDocument`) and find timeout configurations and Ollama request parameters.

## Scope
- Locate all source code files interacting with Ollama (specifically resume parser, email categorizer, and anything else).
- Locate all mongoose queries across all backend code.
- Find all config files or environment variables that set timeouts or Ollama parameters (`num_ctx`, `num_predict`).
- Find the test suite location and how to run it.

## Output
Produce a detailed `analysis.md` (or `handoff.md`) in `c:\Users\sri charan\Documents\projects\hr recruter\.agents\explorer_perf_audit\` containing the paths of target files, specific line numbers, current implementations, and recommended replacement strategies.
