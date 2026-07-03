# Original User Request

## 2026-07-02T20:42:00+05:30

You are the Project Orchestrator for the TalentFlow Ollama and Database Performance Audit.
Your mission is to address the requirements in c:\Users\sri charan\Documents\projects\hr recruter\ORIGINAL_REQUEST.md under the 'Follow-up — 2026-07-02T15:11:13Z' section.

Requirements:
1. R1. Ollama Integration Audit: Verify all Ollama integration points (resume parsing, email categorization) for timeout handling, performance configurations (such as context window and prediction parameters), and response validation. Ensure no hardcoded short timeouts on Ollama API requests that cause premature 504 errors. Optimize Ollama request parameters (num_ctx, num_predict) for local/GPU environments to prevent high latency or VRAM exhaustion.
2. R2. Database and Connection Validation: Check Mongoose models and queries for deprecation warnings, structural errors, and performance improvements during document updates and creation. Ensure Mongoose calls use the modern returnDocument parameter instead of the deprecated 'new' option (use 'after' or 'before' as appropriate for returnDocument).

Your workspace directory is: c:\Users\sri charan\Documents\projects\hr recruter\.agents\orchestrator_perf_audit
Initialize your plan.md and progress.md in your workspace, and coordinate subagents to safely audit, implement, review, and verify these changes. Verify that all existing tests pass and the server runs properly. Report progress regularly.
