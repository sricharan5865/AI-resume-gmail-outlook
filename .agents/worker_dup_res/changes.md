# Changes Made

## `server/server.js`
- Added validation for action to be one of `['update', 'delete-before', 'remove', 'cancel']` at the start of `POST /api/candidates/upload/resolve`. If invalid, updates the IngestionLog (if `logId` is provided) to status 'failed' with error 'Invalid action provided.' and returns `400 Bad Request`.
- Added IngestionLog status update to 'failed' with error 'Candidate not found.' in the `'update'` action handler if the candidate is not found (prior to returning `404`).
- Added RAG cleanup calling `removeCandidate(candidateId)` in the `'remove'` action handler right after deleting the candidate from MongoDB.
- Updated the global catch block in `POST /api/candidates/upload/resolve` to update IngestionLog status to 'failed' with error `error.message` if a `logId` is provided.
