# Synthesis of Ollama Setup Optimization Audits

## Consensus Findings

### 1. Prompt Bloat & Token Overhead (Violation of AGENTS.md Rule 4.1)
- Downstream tasks (`scoreCandidate`, `generateTags`, `scoreCandidateByOwnCategory`, `generateQuestionsForCandidate`) currently receive the full, verbose candidate profile which includes large arrays of previously generated Q&A lists.
- This results in prompts exceeding 2,500 tokens (over the 800-token recommendation), causing high pre-processing latency.
- **Solution**: Implement `compressCandidateProfile(profile)` to remove generated lists before downstream LLM processing, and `stripSchemaDescriptions(schema)` to compress system schemas.

### 2. Lack of Task-Specific Parameter Tuning (Violation of AGENTS.md Rule 4.2)
- Simple classification/indexing tasks currently request a `num_ctx: 8192` and `num_predict: 2048` window, which causes excessive VRAM consumption and high latency locally.
- `embeddingService.js` lacks an `options` block (specifically `num_ctx`).
- **Solution**: Implement dynamic parameter mapping based on task type:
  - Complex tasks: `num_ctx: 8192`, `num_predict: 2048`.
  - Simple tasks: `num_ctx: 2048`, `num_predict: 256`.
  - Embeddings: `num_ctx: 8192`.

### 3. Connection & Timeout Settings (Violation of AGENTS.md Rule 4.3)
- Request timeout for Ollama calls is set statically to 15 minutes (`900000ms`), blocking Node event loops if the service hangs.
- **Solution**: Use shorter, context-specific timeouts (e.g., 30s for simple queries, 5 mins for resume parsing) with fallback logic.

### 4. Embedding Configuration Conflict
- In `server/models.js`, there is no separate embedding model setting. If `ollamaModel` is changed in the admin dashboard to a chat model (like `llama3`), the embedding service attempts to use it, causing failures.
- The embedding batch size is statically set to `100`, which overloads local Ollama deployments.
- **Solution**:
  - Add `ollamaEmbeddingModel` to the settings schema (default: `'nomic-embed-text'`).
  - Set `BATCH_SIZE = 10` for Ollama embeddings.

### 5. Multimodal Parser Bug
- `parseResume` passes a placeholder prompt "Analyze the attached PDF resume" to Ollama when a base64 PDF is uploaded. Since Ollama cannot read base64 PDFs in this pipeline, it fails.
- **Solution**: Ensure Ollama requests default to raw extracted `resumeText`.

## Deployment/System Optimization
- Optimize CPU thread allocation to `N - 2` physical cores using environment variables (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`).
- Limit VRAM/RAM load via system environment variables: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=2`, `OLLAMA_KEEP_ALIVE=60m`.
