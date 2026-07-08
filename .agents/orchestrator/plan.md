# Project Plan: HR Recruitment Platform Enhancements

## Overview
Enhance the TalentFlow recruitment automation platform with four improvements:
1. Filtered Excel export with stage selection dialog (R1).
2. Smarter AI/RAG search that accepts a job description, scores/ranks candidates against it with JD-tailored questions (R2).
3. De-duplicated recruitment logs preventing same-stage entries (R3).
4. Standardized HR cold-calling questions prepended to the question bank (R4).

## Architecture & Codebase Focus
- `client/src/components/PipelineBoard.jsx`: Enhance `handleExport` to show a modal for choosing pipeline stages, and verify `handleDrop` prevents calling the stage-change API if the stage hasn't changed.
- `client/src/components/RAGSearch.jsx`: Enhance "Ask AI" search box to accept a job description and render ranked candidates with match scores, missing/matching skills, and tailored questions.
- `client/src/components/CandidateDetails.jsx`: Add the stage-change guard to `handleStageSelect` and ensure the candidate profile UI displays all 14 HR questions properly.
- `server/server.js`: In `PATCH /api/candidates/:id/stage`, prevent duplicate history logging if the new stage matches the current stage. Add a new POST `/api/rag/jd-search` endpoint for JD-based RAG search, scoring, ranking & questions generation.
- `server/ragService.js`: Ensure RAG search is queryable by JD text.
- `server/geminiParser.js`: Update `scoreCandidate` or similar to handle scoring against a JD (using `callAIProvider()`). Update `mapAnalysisToQuestions()` to prepending the 7 cold-calling questions and then generating the remaining 7.

## Milestone / Phase Breakdown

### Phase 1: Exploration & Codebase Analysis
- **Goal**: Analyze the affected files to find where and how these features are currently structured.
- **Subagents**: Spawn 3 `teamwork_preview_explorer` agents to audit client code, backend server code, and AI/RAG services.

### Phase 2: Implementation
- **Goal**: Sequentially implement the enhancements.
- **Subagents**: Spawn 1 `teamwork_preview_worker` agent to implement the changes.
- **Verification**: Run tests & basic compiles.

### Phase 3: Review & Validation
- **Goal**: Review implementation for correctness, robustness, and style.
- **Subagents**:
  - Spawn 2 `teamwork_preview_reviewer` agents.
  - Spawn 2 `teamwork_preview_challenger` agents to run tests.
  - Spawn 1 `teamwork_preview_auditor` to check integrity.

### Phase 4: Running Server & Handover
- **Goal**: Start development server, run E2E test validation, and submit the final victory claim.
