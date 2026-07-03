# BRIEFING — 2026-07-02T22:20:00+05:30

## Mission
Audit `server/geminiParser.js` for Ollama integration points, prompt sizes, configuration parameters, and propose a compression/parameter tuning plan.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Read-only investigator, analyzer
- Working directory: c:\Users\sri charan\Documents\projects\hr recruter\.agents\explorer_audit_1
- Original parent: 5514c725-c82f-4659-aad7-043243c47d03
- Milestone: Ollama Setup Optimization

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze server/geminiParser.js for Ollama integration points
- Follow AGENTS.md constraints for Ollama setup

## Current Parent
- Conversation ID: 5514c725-c82f-4659-aad7-043243c47d03
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `server/geminiParser.js` - Audited Ollama integration points, schema sizing, prompt structures, and parameters.
  - `c:\Users\sri charan\Documents\projects\hr recruter\.agents\AGENTS.md` - Verified target parameters and optimization constraints.
  - `c:\Users\sri charan\Documents\projects\hr recruter\..agents\explorer_perf_audit\handoff.md` - Read previous performance audit context for synergy.
- **Key findings**:
  - Ollama is called in `callAIProvider` using `fetchWithTimeout` on `${ollamaUrl}/api/chat` with hardcoded `num_ctx: 8192` and `num_predict: 2048` for all requests, regardless of simplicity.
  - A 15-minute (`900000` ms) timeout is hardcoded for Ollama requests, which can block local execution thread.
  - Candidate profile objects passed to downstream methods like `scoreCandidate` and `generateTags` contain full, massive generated analyses and Q&A lists (~2500 tokens), causing high pre-processing overhead.
  - Non-multimodal providers (Ollama, OpenAI) ignore `pdfBase64` but `parseResume` still uses a PDF placeholder prompt, resulting in empty/failed resume parsing.
  - A large JSON schema is stringified and sent in a user message, adding ~650-900 tokens of boilerplate.
- **Unexplored areas**: None. The audit is complete.

## Key Decisions Made
- Formulated candidate profile compression helper recommendation.
- Formulated JSON schema description stripping recommendation.
- Formulated dynamic options configuration (num_ctx, num_predict, timeouts) based on simple/complex task rules.

## Artifact Index
- `.agents/explorer_audit_1/ORIGINAL_REQUEST.md` — Original request
- `.agents/explorer_audit_1/BRIEFING.md` — Briefing memory
- `.agents/explorer_audit_1/progress.md` — Heartbeat and progress tracker
- `.agents/explorer_audit_1/analysis.md` — Final structured audit report (TBD next)
- `.agents/explorer_audit_1/handoff.md` — Team handoff report (TBD next)
