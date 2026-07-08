# Original User Request

## Follow-up — 2026-07-02T16:47:38Z

Optimize local Ollama setups to eliminate performance bottlenecks and reduce latency for long prompts, ensuring immediate delivery of actionable solutions.

Working directory: c:\Users\sri charan\Documents\projects\hr recruter

## Requirements

### R1. System Configurations Audit
Create optimization guidelines and configuration modifications to tune Ollama system service parameters (e.g., systemd environment settings, thread count, batch sizing, context settings) for local GPU/CPU hardware.

### R2. Context Window and Prompt Compression Logic
Design and write modular utility code to dynamically compress prompts and optimize context windows (`num_ctx`, `num_predict`) for any custom LLM pipelines running on local instances.

## Acceptance Criteria

### Execution & Performance
- [ ] Prompt pre-processing latency is reduced by at least 50% for typical resume processing payloads.
- [ ] System handles inputs without memory/VRAM exhaustion on standard hardware.
- [ ] Configuration scripts/files are fully verified and ready for deployment.

## Follow-up — 2026-07-06T14:35:39Z

Enhance the TalentFlow HR Recruitment platform with four improvements: filtered Excel export with stage selection dialog, smarter AI/RAG search that accepts a job description and scores/ranks candidates against it with JD-tailored questions, de-duplicated recruitment logs that prevent same-stage entries, and standardized HR cold-calling questions prepended to the question bank.

Working directory: c:\Users\sri charan\Documents\projects\hr recruter
Integrity mode: development

> IMPORTANT: Existing Code Rules (from project AGENTS.md):
> - Do NOT delete or overwrite existing web pages, components, views, or routing files.
> - Preserve all existing functionality — these are additive enhancements.
> - When calling LLMs (OpenRouter, Gemini, Ollama), always set max_tokens / maxOutputTokens to at least 8000/8192 to prevent truncation.
> - The system uses MongoDB via Mongoose. In-memory vector index for RAG.
> - The project runs on Node.js (server) + Vite/React (client).
> - The backend AI provider is configured in Settings (Gemini, Claude, OpenAI, or Ollama). Use the existing callAIProvider() function in geminiParser.js for any new LLM calls.

## Requirements

### R1. Export to Excel — Stage Filter Dialog
When the "Export to Excel" button is clicked on the Pipeline Kanban page (client/src/components/PipelineBoard.jsx), instead of immediately exporting all candidates, show a modal/dialog that lets the user choose which pipeline stages to include in the export. The options should be checkboxes for: Inbox, Shortlist, Interview, Offered, Rejected (and an "All" option). Only candidates matching the selected stages should be exported. The current export function (handleExport at lines 29-57) exports sortedCandidates without any stage filtering — this must be enhanced to filter by the selected stages before passing to exportToCSV().

### R2. AI Search — JD-Based Candidate Scoring, Ranking & Question Generation
In the AI Search page (client/src/components/RAGSearch.jsx), enhance the "Ask AI" mode so that when a user pastes a job description with required qualifications:

1. Find candidates via RAG: Use the existing vector search (searchResumes() in server/ragService.js) to find candidates whose resume content is semantically relevant to the JD text.

2. Score & Rank against the JD: For each matched candidate, use the existing scoring model (scoreCandidate() in server/geminiParser.js) or a similar AI call to analyze the candidate's qualities against the JD requirements and produce a match score (0-100), matching skills, missing skills, and an explanation. Return the candidates ranked by this score.

3. Generate JD-tailored interview questions: For the top matched candidates, automatically generate new interview questions that are tailored to the job description (using the existing generateQuestionsForCandidate() function which already accepts a job description parameter). The AI Search results should show these JD-specific questions or indicate that questions have been regenerated for the JD context.

The backend endpoint for this can be a new route (e.g. POST /api/rag/jd-search) or an enhancement to the existing /api/rag/ask endpoint. The frontend should display the ranked candidates with their JD match scores, matching/missing skills, and the generated questions.

### R3. Recruitment Log — No Duplicate Same-Stage Entries
In the candidate stage change endpoint (server.js PATCH /api/candidates/:id/stage around line 1792), add a guard so that if the new stage is identical to the current stage, the server returns the candidate unchanged without adding a history entry. This prevents duplicate log entries like "Moved from Shortlist to Shortlist". Also add the same guard on the frontend side in PipelineBoard.jsx (handleDrop around line 132) and CandidateDetails.jsx (handleStageSelect) so the API is not called at all when the stage hasn't changed.

### R4. HR Questions — Standardized Cold-Calling Questions + Tailored Questions (14 total)
Modify the HR question generation in server/geminiParser.js so that the final hrQuestions array contains exactly 14 questions (not 7). The first 7 must always be these fixed cold-calling screening questions (with generic sample answers):

1. "Are you looking for a job?"
2. "How many years of experience do you have?"
3. "What is the reason for your job change?"
4. "What is your current CTC?"
5. "What is your expected CTC?"
6. "What is your notice period?"
7. "Is your notice period negotiable? (If the notice period is 30, 60, or 90 days)"

The remaining 7 should be the AI-generated, candidate-personalized HR questions that the system already produces (from mapAnalysisToQuestions() lines 757-876 and the LLM prompt section 5). Update the mapAnalysisToQuestions() function to prepend the 7 fixed questions and then append up to 7 AI-generated ones. The CandidateDetails.jsx UI that renders HR questions should display all 14 properly.

## Acceptance Criteria

### Export to Excel
- [ ] Clicking "Export to Excel" on the Pipeline Kanban shows a stage selection dialog before exporting
- [ ] The dialog has checkboxes for Inbox, Shortlist, Interview, Offered, Rejected, and an "All" toggle
- [ ] Selecting specific stages and confirming exports only candidates in those stages
- [ ] Selecting "All" or all checkboxes exports the same data as the old behavior
- [ ] The dialog can be cancelled without exporting

### AI Search with JD Scoring
- [ ] Pasting a job description into the Ask AI search box triggers a JD-based candidate search
- [ ] Each matched candidate is scored (0-100) against the JD with matching skills, missing skills, and explanation displayed
- [ ] Candidates are ranked by their JD match score (highest first)
- [ ] JD-tailored interview questions are generated or available for the top matched candidates
- [ ] The UI clearly shows the JD analysis results distinct from regular search results

### Recruitment Log De-duplication
- [ ] Dragging a candidate to the same column they are already in does NOT create a new history entry
- [ ] Changing the stage dropdown in CandidateDetails to the same value does NOT create a log
- [ ] The server endpoint returns the candidate unchanged when old stage equals new stage
- [ ] Actual stage changes (e.g., Inbox to Shortlist) still log correctly

### HR Questions
- [ ] Every newly parsed candidate has exactly 14 HR questions (not 7)
- [ ] The first 7 questions are always the standardized cold-calling questions in the exact order specified
- [ ] Questions 8-14 are AI-generated and personalized to the candidate's resume
- [ ] The HR questions section in the candidate profile UI displays all 14 questions properly
- [ ] Previously parsed candidates are unaffected (their existing questions remain)

## Verification Plan

### Automated Tests
- After changes, start the dev server (npm run dev in client, node server.js in server) and verify no startup errors
- Upload a test resume and verify 14 HR questions are generated with the first 7 being the cold-calling script

### Manual Verification
- Test Export to Excel: click button then verify dialog appears, select Shortlist only, verify exported CSV contains only Shortlist candidates
- Test AI Search: paste a GIS Analyst job description, verify candidates appear ranked with scores, matching/missing skills, and tailored questions
- Test duplicate logs: drag a candidate to its current column, verify no new log entry appears
- Test HR questions: open a newly parsed candidate, verify first 7 are the cold-calling questions
