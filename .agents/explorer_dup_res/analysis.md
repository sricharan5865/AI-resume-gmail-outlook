# Duplicate Candidate Upload & Resolution Analysis

## Overview
This report provides a detailed technical analysis of the duplicate candidate upload and resolution pipeline in the TalentFlow recruitment application. It identifies the duplicate detection mechanisms, traces the 4 resolution actions, highlights several critical database and logging consistency gaps in the backend code, and provides a comprehensive end-to-end testing design using Vitest.

---

## 1. Candidate Upload & Duplicate Detection Flow
When a user uploads a resume via the `POST /api/candidates/upload` route, the following operations occur:
1. **File Parsing**: The uploaded file (PDF or DOCX) is temporarily saved, its text is extracted, and the LLM parses the text into structured JSON (`parsedData`).
2. **Duplicate Check**: The backend performs a search against the `Candidate` collection. It constructs a regex query for both the `email` and the `name` extracted by the parser (if present), searching case-insensitively:
   ```javascript
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
   *Note: The query uses `$or`, meaning a duplicate is flagged if **either** the email matches **or** the name matches.*
3. **Log Update & Response**: If a duplicate is found:
   - The associated `IngestionLog` status is updated to `'duplicate'`.
   - The system returns a **`409 Conflict`** status code with a JSON response containing:
     - `duplicate: true`
     - `candidate`: The existing candidate document.
     - `tempFile`: The filename of the newly uploaded file in the uploads directory.
     - `parsedData`: The parsed resume data of the new upload.
     - `pdfText`: The raw text of the new resume.
     - `jobId` & `logId`: Contextual identifiers.
   - Importantly, the uploaded file is *not* deleted yet; it remains on disk under the temporary name, waiting for the user's resolution decision.

---

## 2. Duplicate Resolution Actions Trace
When the user resolves a duplicate conflict, the frontend sends a `POST` request to `/api/candidates/upload/resolve` with the selected `action`. The table below outlines how each of the 4 actions affects the system:

| Action | Candidate Document (MongoDB) | IngestionLog Status | Uploaded Temp Files | RAG Index |
| :--- | :--- | :--- | :--- | :--- |
| **`update`** | Overwrites existing document fields (skills, experience, education, etc.) with new parsed data. Re-scores the candidate. Appends an `Updated` entry to candidate history. | Updated to **`'success'`** | Deletes the old resume file on disk. Keeps the new `tempFile` (associated via `resumeUrl`). | Re-indexes candidate in RAG. |
| **`delete-before`** | Deletes the existing candidate document. Creates and saves a new candidate document (fresh ID) with new Q&As. Appends a `Created` entry to candidate history. | Updated to **`'success'`** (linked to new candidate ID) | Deletes the old resume file on disk. Keeps the new `tempFile` (associated via `resumeUrl`). | Removes old candidate ID from RAG. Indexes new candidate ID in RAG. |
| **`remove`** | Deletes the existing candidate document from the database. | Updated to **`'cancelled'`** (with error "Duplicate candidate removed...") | Deletes the old resume file on disk. Deletes the new `tempFile` from disk. | **No RAG action** (Gap identified). |
| **`cancel`** | Left completely unmodified in the database. | Updated to **`'cancelled'`** (with error "Discarded uploaded file.") | Retains the old resume file. Deletes the new `tempFile` from disk. | No RAG action (correct). |

---

## 3. Identified Gaps and Vulnerabilities in Backend Code

### Gap A: Missing `IngestionLog` Status Update on General Exceptions
The entire `/api/candidates/upload/resolve` handler is wrapped in a `try...catch` block. However, the `catch` block does not perform any database operations on the `IngestionLog`:
```javascript
} catch (error) {
  console.error('Failed to resolve duplicate upload:', error);
  res.status(500).json({ error: error.message });
}
```
* **Impact**: If any database save fails (e.g., MongoDB validation error), if scoring fails, or if `fs.unlinkSync` throws an error, the HTTP request fails with a `500` status, but the `IngestionLog` remains stuck as `'duplicate'` or `'processing'`. It should be updated to `'failed'` with `error: error.message`.

### Gap B: Missing `IngestionLog` Status Update on Candidate Not Found
For the `'update'` action, if the existing candidate is not found (e.g. deleted concurrently in another session):
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
* **Impact**: The endpoint returns a `404` and cleans up the temp file, but it returns early without updating the `IngestionLog`. The log remains stuck in its previous state instead of being set to `'failed'`.

### Gap C: Fallback Else Block Vulnerability
If an invalid action is sent (e.g., due to a frontend bug or API manipulation), the endpoint falls into the `else` block:
- If `parsedData` is present in the request body, the endpoint will silently treat the request as a normal candidate creation, importing the candidate as a new document (creating a duplicate) and marking the log as `'success'`.
- If `parsedData` is absent, it unlinks the temp file, marks the log as `'cancelled'`, and returns `{ success: true, cancelled: true }`.
* **Impact**: The API does not validate actions strictly. It should validate that the `action` is one of the four allowed values (`'update'`, `'delete-before'`, `'remove'`, `'cancel'`) and return a `400 Bad Request` if it is invalid.

### Gap D: Missing RAG Clean-up on `'remove'` Action
When the `'remove'` action is invoked, it deletes the candidate from the database:
```javascript
await Candidate.deleteOne({ id: candidateId });
```
However, unlike the `'delete-before'` action, it does **not** call the RAG clean-up function:
```javascript
// Missing in action === 'remove'
removeCandidate(candidateId).catch(err => console.error('RAG removal failed:', err.message));
```
* **Impact**: Orphaned vector embeddings for deleted candidates remain in the RAG search database, causing search mismatch issues.

---

## 4. Test Mocking Strategy via `testServerEntry.js`
The file `tests/e2e/testServerEntry.js` sets up a mock environment that intercepts outgoing LLM requests to `openrouter.ai` and `generativelanguage.googleapis.com`.

### How Resume Parsing Mocking Works:
1. When an upload occurs, the Express server calls `parseResume()`, which sends a request to the LLM.
2. The mock fetch in `testServerEntry.js` intercepts this request.
3. It tries to identify which candidate is being parsed:
   - It checks `global.lastUploadedFilename` (set in `server.js` during file upload).
   - If the filename contains `'alice'`, `'bob'`, or `'john'`, it sets the name and email to mock values (e.g., `Alice` and `alice@example.com`).
   - Otherwise, it tries to decode the `pdfBase64` payload from the fetch body. If the text contains `'Alice'`, `'Bob'`, or `'John Doe'`, it uses those names.
   - If no match is found, it falls back to name `"Test Candidate"` and email `"test@example.com"`.
4. It returns a mock JSON response containing the parsed resume structure.

### How to Mock Duplicate Scenarios in E2E Tests:
To test the duplicate pipeline, we need the server to return `409 Conflict`. We can achieve this by doing the following in our Vitest code:
1. **Pre-seed the Database**: Insert a candidate document directly into MongoDB (using mongoose) with the email `'alice@example.com'` and name `'Alice'`.
2. **Execute Upload**:
   - Create a dummy PDF with text `'Alice'`.
   - Send a `POST` request to `/api/candidates/upload` with a file name containing `'alice'` (e.g. `alice_resume.pdf`).
   - This ensures `global.lastUploadedFilename` contains `'alice'`, forcing the mocked LLM fetch to parse the resume as `Alice` (`alice@example.com`).
3. **Verify 409 Conflict**:
   - Assert that the response status code is `409`.
   - Extract `tempFile`, `logId`, and the original candidate's `id` from the JSON payload.
4. **Trigger Resolution POST**:
   - Send a `POST` request to `/api/candidates/upload/resolve` with the extracted parameters and the desired resolution `action`.

---

## 5. Recommended E2E Test Suite Structure
Below is the recommended outline and test cases for `tests/e2e/duplicateResolution.test.js`.

### Test File Template & Imports:
```javascript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

const API_URL = 'http://localhost:5001/api/candidates';

function createDummyPDF(filePath, text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.text(text);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}
```

### Proposed Test Cases:

#### Test 1: Upload Duplicate Candidate Returns 409 Conflict
- **Steps**:
  1. Insert a candidate into MongoDB with `email: 'alice@example.com'`, `name: 'Alice'`.
  2. Upload a file named `alice_resume.pdf` to `/api/candidates/upload`.
- **Assertions**:
  - HTTP status is `409`.
  - JSON response contains `duplicate: true`.
  - JSON response contains the existing candidate ID and a `tempFile` name.
  - `IngestionLog` status for the `logId` is `'duplicate'`.

#### Test 2: Resolve Action "update" (Overwrite Existing)
- **Steps**:
  1. Seed initial candidate `Alice` (email: `alice@example.com`, phone: `111-111-1111`).
  2. Upload duplicate `alice_resume.pdf` to get 409, extract `logId`, `tempFile`, `candidateId`.
  3. Send `POST /api/candidates/upload/resolve` with `action: 'update'`, `parsedData` containing new phone `222-222-2222`.
- **Assertions**:
  - HTTP status is `200`.
  - The candidate in the database has been modified: phone is updated to `222-222-2222`, and `resumeUrl` points to the new `tempFile`.
  - `IngestionLog` status is updated to `'success'`.
  - Candidate history contains an `'Updated'` record.

#### Test 3: Resolve Action "delete-before" (Delete & Re-import)
- **Steps**:
  1. Seed initial candidate `Alice` with ID `old-id` and email `alice@example.com`.
  2. Upload duplicate `alice_resume.pdf` to get 409, extract parameters.
  3. Send `POST /api/candidates/upload/resolve` with `action: 'delete-before'`.
- **Assertions**:
  - HTTP status is `200`.
  - The old candidate with ID `old-id` is deleted from MongoDB.
  - A new candidate with a new ID is created.
  - `IngestionLog` status is `'success'`, and its `candidateId` points to the new candidate ID.

#### Test 4: Resolve Action "remove" (Delete Existing, Halt Import)
- **Steps**:
  1. Seed initial candidate `Alice` (email: `alice@example.com`).
  2. Upload duplicate `alice_resume.pdf` to get 409, extract parameters.
  3. Send `POST /api/candidates/upload/resolve` with `action: 'remove'`.
- **Assertions**:
  - HTTP status is `200`.
  - Existing candidate is deleted from MongoDB.
  - The newly uploaded `tempFile` is deleted from `UPLOADS_DIR`.
  - `IngestionLog` status is updated to `'cancelled'`.

#### Test 5: Resolve Action "cancel" (Discard Upload, Keep Existing)
- **Steps**:
  1. Seed initial candidate `Alice` (email: `alice@example.com`, phone: `111-111-1111`).
  2. Upload duplicate `alice_resume.pdf` to get 409, extract parameters.
  3. Send `POST /api/candidates/upload/resolve` with `action: 'cancel'`.
- **Assertions**:
  - HTTP status is `200`.
  - Existing candidate in MongoDB is unmodified (phone remains `111-111-1111`).
  - The newly uploaded `tempFile` is deleted from `UPLOADS_DIR`.
  - `IngestionLog` status is updated to `'cancelled'`.

#### Test 6: Edge Case - Resolve with Non-Existent Candidate ID (404)
- **Steps**:
  1. Upload duplicate `alice_resume.pdf` to get 409, extract parameters.
  2. Send `POST /api/candidates/upload/resolve` with `action: 'update'` but with an invalid/random `candidateId`.
- **Assertions**:
  - HTTP status is `404` (or `500` depending on error handling).
  - The temp file is unlinked from disk.

#### Test 7: Edge Case - Resolve with Invalid Action
- **Steps**:
  1. Upload duplicate `alice_resume.pdf` to get 409, extract parameters.
  2. Send `POST /api/candidates/upload/resolve` with `action: 'invalid_action'`.
- **Assertions**:
  - The API handles the error cleanly, returning a failure code or resolving safely without polluting the database.
