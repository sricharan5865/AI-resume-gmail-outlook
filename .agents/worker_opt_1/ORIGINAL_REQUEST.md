## 2026-07-02T16:50:33Z

You are a Worker subagent for the Ollama Setup Optimization project.
Your working directory is: c:\Users\sri charan\Documents\projects\hr recruter\.agents\worker_opt_1
Your task is to implement the optimization code modifications and write the system guidelines.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute the following steps:
1. Create `OLLAMA_SYSTEM_OPTIMIZATION.md` in the project root containing the system configurations audit and tuning guide (e.g. CPU threads allocation physical cores N-2, OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_LOADED_MODELS=2, OLLAMA_KEEP_ALIVE=60m, systemd configuration template, WSL2 config).
2. Create a new utility file `server/ollamaOptimizer.js` that implements and exports:
   - `compressCandidateProfile(profile)`: strips previously generated large analysis data from the candidate profile JSON (e.g., `interviewQuestions`, `hrQuestions`, `technicalQuestions`, `career_gaps`, `technical_depth_audit`, `domain_question_bank`, `project_deep_dive`, `hr_questions`, `red_flags`, `must_prepare_topics`, `fit_summary`).
   - `stripSchemaDescriptions(schema)`: recursively strips `description` keys from JSON schema objects to save token overhead.
3. Update `server/models.js` to add `ollamaEmbeddingModel` to the settings schema (default: `'nomic-embed-text'`).
4. Update `server/server.js` settings API routes to allow saving and reading `ollamaEmbeddingModel`.
5. Update `client/src/components/Settings.jsx` to render an input field for Embedding Model Name under Model Name, and bind it to `ollamaEmbeddingModel`. Keep other sections unchanged.
6. Integrate the optimization utility in `server/geminiParser.js`:
   - Import/require `ollamaOptimizer.js` functions.
   - Refactor `callAIProvider` to accept an `options = {}` object, applying task-specific parameters:
     - Complex tasks (`parseResume`, `generateQuestionsForCandidate`): `num_ctx: 8192`, `num_predict: 2048`, timeout of 5 minutes (`300000` ms).
     - Simple tasks: `num_ctx: 2048`, `num_predict: 256`, timeout of 30 seconds (`30000` ms).
   - In `callAIProvider`, if a schema is passed, run it through `stripSchemaDescriptions(schema)`.
   - In `parseResume`, make sure that if using Ollama, it uses raw resume text (`resumeText`) rather than passing an empty PDF string indicator if PDF base64 is uploaded.
   - Compress the candidate profile with `compressCandidateProfile` before stringifying it for prompts in downstream tasks (`scoreCandidate`, `generateTags`, `scoreCandidateByOwnCategory`, `generateQuestionsForCandidate`).
7. Update `server/embeddingService.js`:
   - Use `settings?.ollamaEmbeddingModel || 'nomic-embed-text'` for embeddings.
   - Pass options: `{ options: { num_ctx: 8192 } }` in the `/api/embed` request body payload.
   - Change `BATCH_SIZE = provider === 'ollama' ? 10 : 100` to process in smaller chunks.
8. Update `server/emailCategorizer.js` to compress classification instructions and use parameters `num_ctx: 2048`, `num_predict: 256`, timeout `30000` ms.

Once completed, run server startup validation or test commands using the workspace dev/test scripts (via `run_command` from your workspace) and confirm everything builds and passes. Write your handoff report to `handoff.md` in your working directory and notify the orchestrator (conversation ID: 5514c725-c82f-4659-aad7-043243c47d03).
