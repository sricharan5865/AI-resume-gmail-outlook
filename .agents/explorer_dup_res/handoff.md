# Handoff Report — Duplicate Candidate Resolution Analysis

## 1. Observation
- **Candidate Duplicate Checking**:
  In `server/server.js`, during file upload (`POST /api/candidates/upload`, lines 1296–1328), the server checks for existing candidates matching the newly extracted email or name:
  ```javascript
  // Duplicate Check
  let duplicate = null;
  const queries = [];
  if (parsedData.email) {
    queries.push({ email: { $regex: new RegExp(`^${escapeRegex(parsedData.email.trim())}$`, 'i') } });
  }
  if (parsedData.name) {
    queries.push({ name: { $regex: new RegExp(`^${escapeRegex(parsedData.name.trim())}$`, 'i') } });
  }
  if (queries.length > 0) {
    duplicate = await Candidate.findOne({ $or: queries });
  }
  ```
  If a duplicate is found, the server updates `IngestionLog` status to `'duplicate'` and returns a `409 Conflict` status code with the details needed for resolution:
  ```javascript
  return res.status(409).json({
    error: `Candidate with email ${parsedData.email || 'N/A'} (${duplicate.name}) already exists in the pipeline.`,
    duplicate: true,
    candidate: duplicate,
    tempFile: req.file.filename,
    parsedData: parsedData,
    pdfText: pdfText,
    jobId: jobId || null,
    logId: activeLogId
  });
  ```

- **Resolution Endpoint Errors and Gaps**:
  In `server/server.js` (`POST /api/candidates/upload/resolve`, lines 1411–1789):
  1. The global `catch` block does not update the ingestion log status:
     ```javascript
     } catch (error) {
       console.error('Failed to resolve duplicate upload:', error);
       res.status(500).json({ error: error.message });
     }
     ```
  2. The candidate existence validation in `'update'` returns a `404` status early and unlinks the temp file, but does not update `IngestionLog`:
     ```javascript
     const candidate = await Candidate.findOne({ id: candidateId });
     if (!candidate) {
       if (tempFile) {
         const tempPath = path.join(UPLOADS_DIR, tempFile);
         if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
       }
       return res.status(404).json({ error: 'Candidate not found.' });
     }
     ```
  3. Under `action === 'remove'`, the candidate is deleted from the DB (line 1521), but no call to `removeCandidate(candidateId)` is made to clean up the candidate's vector search index in RAG, unlike `delete-before` on line 1556:
     ```javascript
     removeCandidate(candidateId).catch(err => console.error('RAG removal failed:', err.message));
     ```

- **E2E Test Mocking**:
  In `tests/e2e/testServerEntry.js` (lines 79–112), the global `fetch` interceptor parses candidate credentials based on `global.lastUploadedFilename`:
  ```javascript
  if (global.lastUploadedFilename) {
    if (global.lastUploadedFilename.toLowerCase().includes('alice')) {
      candidateName = 'Alice';
      candidateEmail = 'alice@example.com';
    } ...
  ```

---

## 2. Logic Chain
1. **Duplicate Detection**: The manual upload route (`POST /api/candidates/upload`) matches either the parsed name or email against the `Candidate` collection. If a match is found, the file remains on disk as a temporary file (`tempFile`), and a `409 Conflict` is returned containing the `tempFile` name, `candidate.id`, and `logId`.
2. **Resolution API**: To complete the workflow, the client must POST to `/api/candidates/upload/resolve` with an `action` parameter.
3. **Database Consistency Gaps**:
   - If a database write throws an error or if unlinking files fails, the resolution endpoint catches the exception and returns `500`, leaving the `IngestionLog` status stuck in `'duplicate'` or `'processing'`.
   - If the candidate is deleted before `'update'` is run, the endpoint returns `404` but leaves the `IngestionLog` stuck in its previous status.
   - If `'remove'` is executed, the candidate is deleted from MongoDB, but their vector embeddings in the RAG service are never deleted.
4. **Mocking Candidates for Test**: Since `testServerEntry.js` checks `global.lastUploadedFilename` for `'alice'` to output `Alice` and `alice@example.com`, we can seed the test DB with `Alice` and upload a file named `alice_resume.pdf` to trigger a `409` conflict deterministically.

---

## 3. Caveats
- **RAG Execution**: The behavior of the async functions `indexCandidate()` and `removeCandidate()` was analyzed statically. Since I did not run the application or the RAG service locally, I could not verify if there are any downstream runtime errors in the RAG handlers.
- **Email Ingestion**: The automated background email ingestion logic (`processEmailAttachment`) is not covered by the user resolution flow (it simply marks candidates as duplicates and exits), so it was excluded from the proposed E2E test scenarios.

---

## 4. Conclusion
The backend duplicate resolution pipeline works correctly for standard operations but has critical vulnerabilities:
1. `IngestionLog` status is not set to `'failed'` upon resolution exceptions (Gap A) or if a candidate is not found (Gap B).
2. Deleting a duplicate candidate via the `'remove'` action leaves orphaned vector records in the RAG index (Gap D).
3. The fallback `else` block lacks action validation (Gap C).

Implementing the proposed E2E test suite `tests/e2e/duplicateResolution.test.js` using Vitest will help the implementer verify these edge cases and safeguard against regressions.

---

## 5. Verification Method
1. **How to run tests**:
   In the `server/` directory, run:
   ```powershell
   npm run test:e2e
   ```
   This command starts the test server (using `testServerEntry.js` on port `5001`) and triggers Vitest E2E tests in the workspace.
2. **Files to inspect**:
   - `server/server.js` (to check resolve action logic and error blocks).
   - `tests/e2e/testServerEntry.js` (to verify mock fetch rules).
   - `tests/e2e/duplicateResolution.test.js` (once created by the implementer).
