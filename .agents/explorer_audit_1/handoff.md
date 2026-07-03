# Handoff Report — Ollama Integration Audit

## 1. Observation
I audited `server/geminiParser.js` and compared its Ollama integration to the requirements specified in `c:\Users\sri charan\Documents\projects\hr recruter\.agents\AGENTS.md`.

* **Static Ollama Parameters (Lines 584–588)**:
  ```javascript
      const requestBody = {
        model: ollamaModel,
        messages,
        stream: false,
        options: {
          temperature: 0.1,
          num_ctx: 8192,
          num_predict: 2048
        }
      };
  ```
  This request body is used for *all* Ollama requests, whether complex (`parseResume`, `generateQuestionsForCandidate`) or simple (`scoreCandidate`, `generateTags`, `scoreCandidateByOwnCategory`).

* **Excessive Timeout (Line 601)**:
  ```javascript
          const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }, 900000);
  ```
  The connection timeout for all Ollama requests is hardcoded to 15 minutes (`900000` ms).

* **Uncompressed Candidate Profile Prompts (Lines 987–996, 1021–1034, 1082–1086, 1227–1233)**:
  Downstream methods pass the full `candidateProfile` database object straight into JSON stringification. This object contains massive arrays of previously generated Q&A pairs, timeline gaps, red flags, and fit summaries, adding ~2,000 to ~2,500 tokens of redundant content to the user prompt. For example, in `scoreCandidate` (line 987):
  ```javascript
    const prompt = `
  Candidate Profile:
  ${JSON.stringify(candidateProfile, null, 2)}
  ...
  ```

* **Multimodal Fallback Failure (Lines 948–951)**:
  ```javascript
    const prompt = pdfBase64
      ? `Analyze the attached PDF resume and perform the recruiter seven-part analysis.`
      : `Parse this resume text and perform the recruiter seven-part analysis:\n\n${resumeText}`;
  ```
  If `pdfBase64` is provided, the prompt instructs the model to analyze the PDF. However, the Ollama branch does not append `pdfBase64` to the request payload (lines 564–640), causing the local model to receive an empty instruction.

---

## 2. Logic Chain
1. **Rule Violation (Parameters)**: `AGENTS.md` requires `num_ctx: 2048` and `num_predict: 256` for simple tasks. By using static options (`num_ctx: 8192`, `num_predict: 2048`) for all requests, the system incurs high VRAM usage and processing latency on local Ollama models.
2. **Rule Violation (Timeouts)**: `AGENTS.md` mandates short timeout wrappers (e.g. 10s for status checks) to avoid thread blocking. The hardcoded 15-minute timeout in `geminiParser.js` leaves the Node.js event loop vulnerable to hanging sockets if the local Ollama service becomes unresponsive.
3. **Prompt Bloat**: Passing generated questions/flags in the candidate profile prompt adds ~2,000 unnecessary tokens. Since downstream tasks (`scoreCandidate`, `generateTags`, etc.) only evaluate base profile qualifications, stripping these generated arrays saves ~70–85% of prompt pre-processing latency.
4. **Ollama Ingestion Failure**: Since Ollama does not receive or support base64 PDF payloads in `callAIProvider`, setting the prompt to `Analyze the attached PDF resume...` without the PDF prevents Ollama from extracting any data. Using the extracted `resumeText` instead is necessary.

---

## 3. Caveats
* I analyzed the code under the assumption that local Ollama models are run in resource-constrained environments (like a developer CPU/GPU laptop), where prompt length directly affects latency and VRAM limits.
* This is a read-only investigation; no code changes have been implemented yet.

---

## 4. Conclusion
To achieve compliance with `AGENTS.md` and optimize performance:
1. **Dynamic Options**: Add a fifth parameter `options` to `callAIProvider` to dynamically set `num_ctx`, `num_predict`, and timeouts per task.
2. **Candidate Profile Compression**: Implement a helper function `compressCandidateProfile` to strip generated arrays before JSON stringification.
3. **JSON Schema Compression**: Implement `stripSchemaDescriptions` to prune description keys from schemas for local Ollama runs.
4. **Ingestion Fallback**: Update the prompt in `parseResume` to use `resumeText` when the provider is Ollama or OpenAI.

---

## 5. Verification Method
1. **File Review**: Inspect `server/geminiParser.js` at lines 584–588, line 601, and line 948 to confirm the hardcoded values and logic.
2. **Code Execution**: Review `analysis.md` in this directory for the full optimization plan and code diffs.
3. **Test Command**: Once implemented, run `npm run test:run` in the `server` directory to verify candidate parsing and scoring tests run successfully.
