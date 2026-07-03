# Performance Audit & Database Validation Plan

## Goal
Safely audit, optimize, implement, and verify the performance of the local Ollama LLM integration and resolve Mongoose query/schema deprecations and issues.

## Milestones & Decompositions
1. **Milestone 1: Exploration & Audit (Explorer)**
   - Analyze files for Ollama integration (timeouts, `num_ctx`, `num_predict`, response validations).
   - Find all Mongoose queries and check for deprecated settings (specifically `new: true` vs `returnDocument`).
   - Find existing tests and verify the command to run them.
2. **Milestone 2: Optimization Planning & Interface Design**
   - Design code patterns to support local/GPU optimization for Ollama parameters.
   - Define exact mongoose query replacements mapping the legacy `new: true` options to `returnDocument: 'after'` or similar.
   - Update `PROJECT.md` with findings and planned changes.
3. **Milestone 3: Implementation (Worker)**
   - Apply fixes for Ollama timeouts and model parameters (`num_ctx`, `num_predict`).
   - Replace Mongoose queries using deprecated option `new: true` with `returnDocument: 'after'` / `'before'`.
   - Resolve any other Mongoose deprecation warnings or schema structural errors.
4. **Milestone 4: Review (Reviewer)**
   - Review changes for robustness, validation, security, and schema correctness.
   - Verify code layout.
5. **Milestone 5: Verification (Challenger & Forensic Auditor)**
   - Challenger runs performance checks or stress test queries.
   - Forensic Auditor audits integrity to ensure no hardcoded bypasses or cheating exists.
6. **Milestone 6: E2E and Unit Verification & Server Checks**
   - Run the project's tests to ensure 100% success.
   - Start the development server and verify it runs without crashing, and basic API endpoints remain fully functional.

## Artifacts
- `.agents/orchestrator_perf_audit/BRIEFING.md`
- `.agents/orchestrator_perf_audit/progress.md`
- `.agents/orchestrator_perf_audit/plan.md`
- `.agents/orchestrator_perf_audit/PROJECT.md`
