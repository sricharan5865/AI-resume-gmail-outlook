# Plan - E2E Tests & Audit for Duplicate Candidate Upload and Resolution Pipeline

This plan defines the steps to implement comprehensive automated E2E tests for the duplicate candidate upload and resolution pipeline, and to perform a backend code audit to identify and resolve any pipeline implementation gaps.

## Decomposed Steps

### Phase 1: Analysis & Audit
1. **Analyze Current Implementation**: View current codebase around `/api/candidates/upload/resolve` and the upload check in `server/server.js`.
2. **Audit Gaps**: Identify if the `IngestionLog` status update flows (e.g., transitions to 'success', 'cancelled', 'failed') are fully covered.
3. **Verify LLM Mocking**: Inspect `tests/e2e/testServerEntry.js` to determine if we need to adjust LLM mocks to handle duplicate resume uploads correctly.

### Phase 2: Implementation & Testing
4. **Harden Backend (if needed)**: Address any gaps in backend error handling, such as updating `IngestionLog` to 'failed' if a resolution action throws an exception.
5. **Implement E2E Test Suite**: Create `tests/e2e/duplicateResolution.test.js` using Vitest, covering:
   - **Update Action**: Uploading candidate twice -> 409 conflict -> resolution 'update' -> verify candidate preserves ID, updates other fields, and `IngestionLog` status is 'success'.
   - **Delete & Re-import Action**: Uploading candidate twice -> 409 conflict -> resolution 'delete-before' -> verify candidate gets a new ID, old candidate deleted, and `IngestionLog` status is 'success'.
   - **Delete Existing Only (Halt Import) Action**: Uploading candidate twice -> 409 conflict -> resolution 'remove' -> verify candidate deleted, new file deleted, and `IngestionLog` status is 'cancelled'.
   - **Cancel Action**: Uploading candidate twice -> 409 conflict -> resolution 'cancel' -> verify database unmodified, temp file deleted, and `IngestionLog` status is 'cancelled'.
   - **Error Handling (Failed IngestionLog Status)**: Simulating a resolution failure (e.g. invalid candidate ID update) -> verifying response error and `IngestionLog` status updated to 'failed'.
6. **Verify Test Run**: Run the test suite via `npm run test:e2e` to ensure all tests pass successfully.

### Phase 3: Review & Audit Enforcement
7. **Perform Independent Review**: Invoke a Reviewer subagent to review backend changes and test coverage.
8. **Run Challenger Tests**: Invoke a Challenger subagent to execute the test suite and confirm liveness and accuracy.
9. **Perform Forensic Audit**: Invoke a Forensic Auditor to ensure no integrity violations exist.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Exploration & Auditing | Explore endpoints, mock environment, write findings report | None | PLANNED |
| 2 | Implementation | Implement tests in `tests/e2e/duplicateResolution.test.js` and backend hardening | M1 | PLANNED |
| 3 | Verification & Review | Run E2E tests, review results, and audit integrity | M2 | PLANNED |
