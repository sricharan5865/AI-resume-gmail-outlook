# Project Plan: Ollama JSON Integrity Audit & Hardening

## Overview
Audit the full codebase to identify and fix all potential JSON parsing vulnerabilities related to local Ollama LLM integration (resume parser, email classification, embedding service, and API data handling). We will harden the parsing logic against truncated, unescaped, or malformed JSON payloads, ensuring no unhandled JSON exceptions occur on any API endpoints, and verify all 27 E2E tests pass.

## Architecture & Codebase Focus
- `server/geminiParser.js`: Parses resume text via Ollama/Gemini (Ollama response validation, robust JSON extracting/parsing, sanitization).
- `server/emailCategorizer.js`: Classifies email source requests via Ollama (extracting response category JSON safely).
- `server/embeddingService.js`: Queries Ollama embedding endpoint (safely handle connection errors and format errors).
- `server/server.js`: Handles API requests, including test-connection, resume upload, and email parsing endpoints.
- `client/src/components/Settings.jsx`: UI logic testing connection and handling responses.

## Milestone / Phase Breakdown

### Phase 1: Exploration & Codebase Audit
- **Goal**: Audit backend and frontend files to identify all points where JSON from Ollama or local APIs is parsed or handled. Document vulnerabilities (e.g., direct `JSON.parse` on LLM response, unescaped quotes, truncated JSON outputs).
- **Subagents**: Spawn 3 `teamwork_preview_explorer` agents to perform parallel audits and recommend fixes.
- **Verification**: Consolidate findings into `audit_report.md`.

### Phase 2: Implementation & Hardening
- **Goal**: Implement resilient JSON extraction and parsing utilities (e.g., regex-based JSON substring extraction, brace-matching, parsing try-catch blocks with graceful fallbacks, sanitizing unescaped control characters/newlines).
- **Subagents**: Spawn 1 `teamwork_preview_worker` agent to apply the changes.
- **Verification**: Verify that the server compiles and basic integration flow works without breaking baseline behavior.

### Phase 3: Review & Challenging
- **Goal**: Review the implementation for completeness, correctness, robustness, and style. Write unit tests or edge-case tests to verify resilience to malformed, truncated, or unescaped JSON.
- **Subagents**:
  - Spawn 2 `teamwork_preview_reviewer` agents for code quality, safety, and RBAC preservation verification.
  - Spawn 2 `teamwork_preview_challenger` agents to execute full E2E tests and run adversarial JSON test payloads.
  - Spawn 1 `teamwork_preview_auditor` to run integrity checks (Forensic Audit).
- **Verification**: Ensure E2E test suite passes completely (27/27 tests).

### Phase 4: Final Verification & Handover
- **Goal**: Re-verify all systems, compile final project summary, and hand over to parent Sentinel.
- **Artifact**: `handoff.md` and report to parent.

## Schedule & Timers
- Heartbeat cron: 10 minutes (using `schedule`)
- Safety timers: one-shot fallback timers set for active subagents.
