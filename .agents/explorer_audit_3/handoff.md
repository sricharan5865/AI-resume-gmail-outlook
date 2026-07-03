# Handoff Report: Ollama Setup & Configuration Audit

This handoff report summarizes the findings of the Explorer subagent for the Ollama Setup Optimization task.

---

## 1. Observation
We observed the following configurations and usages in the codebase:
1. **Settings Model**: In `server/models.js` (lines 109-110), the `Settings` schema specifies:
   ```javascript
   ollamaUrl: { type: String, default: 'https://istgenai.smartgeoapps.com/' },
   ollamaModel: { type: String, default: 'llama3' }
   ```
2. **Testing Route**: In `server/server.js` (lines 504-520), the connection test POST `/api/ollama/test-connection` executes:
   ```javascript
   const response = await fetchWithTimeout(`${ollamaUrl.replace(/\/+$/, '')}/api/tags`, {}, 10000);
   ```
3. **Resume Parsing Options**: In `server/geminiParser.js` (lines 584-588), when calling `${ollamaUrl}/api/chat`, it configures:
   ```javascript
   options: {
     temperature: 0.1,
     num_ctx: 8192,
     num_predict: 2048
   }
   ```
   with a `900000` ms (15-minute) timeout, retrying with `num_predict: 4096` if JSON parsing fails due to truncation.
4. **Embedding Generation Options**: In `server/embeddingService.js` (lines 109-132), it uses `/api/embed` with model fallback `nomic-embed-text` and a `180000` ms (3-minute) timeout.
5. **Email Categorizer Options**: In `server/emailCategorizer.js` (lines 456-460), it uses:
   ```javascript
   options: {
     temperature: 0.1,
     num_ctx: 2048,
     num_predict: 256
   }
   ```
   with a `180000` ms (3-minute) timeout.

---

## 2. Logic Chain
1. The Express server uses a single, globally configured `ollamaUrl` and `ollamaModel` stored in MongoDB.
2. The codebase requests a large context limit (`num_ctx: 8192`) and large prediction limit (`num_predict` up to `4096`) during complex resume parsing, while using lightweight options (`num_ctx: 2048`, `num_predict: 256`) for email categorization.
3. Because large contexts on local CPUs or low-spec GPUs consume significant RAM/VRAM, multiple parallel requests can exhaust resources, causing Ollama service crashes.
4. Therefore, the system service running Ollama must be optimized via environment variables (e.g. limiting concurrency with `OLLAMA_NUM_PARALLEL=1` and limiting model overheads with `OLLAMA_MAX_LOADED_MODELS=1` or `2`) and CPU core allocation boundaries to prevent machine freezes and ensure reliability.

---

## 3. Caveats
- No real-world system loads or hardware benchmarks were captured, as this was a read-only investigation under CODE_ONLY constraints.
- System limits must be adjusted based on the specific hosting hardware of the deployment.

---

## 4. Conclusion
The codebase is structured correctly to interact with Ollama, but it requires appropriate system-level configurations of the Ollama service daemon to operate stable on local hardware (preventing OOM errors and thread lockups). The complete set of optimization and deployment recommendations has been documented in `analysis.md`.

---

## 5. Verification Method
- **Inspect File**: Verify the contents of the report at:
  `c:\Users\sri charan\Documents\projects\hr recruter\.agents\explorer_audit_3\analysis.md`
- **Verify Endpoints**: Ensure `/api/ollama/test-connection` returns a list of loaded models when pointed to a running Ollama server.
- **Invalidation Condition**: If the API schema structure of Ollama changes, or if the Express backend changes settings endpoints.
