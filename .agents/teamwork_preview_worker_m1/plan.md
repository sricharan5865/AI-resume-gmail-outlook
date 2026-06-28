# Plan: DB Schema Updates (Milestone 1)

## Step 1: Update `server/models.js`
- **Action**: Add `hrQuestions` and `technicalQuestions` to the `candidateSchema` directly after the `interviewQuestions` field.
- **Verification**: Run a check or syntax validator on `server/models.js`.

## Step 2: Update `server/server.js` (3 Candidate Creation locations)
- **Location 1**: Inside `processEmailAttachment` function.
- **Location 2**: Inside `/api/candidates/extract-gmail` route handler.
- **Location 3**: Inside `/api/candidates/upload` route handler.
- **Action**: Explicitly add `hrQuestions: parsedData.hrQuestions || []` and `technicalQuestions: parsedData.technicalQuestions || []` under candidate initialization.
- **Verification**: Verify that the changes match the structure and style of existing fields.

## Step 3: Run Build / Start Server Verification
- **Action**: Start the server using node to verify that mongoose compiles the schema and connects to MongoDB without any initialization errors.
- **Verification**: Run `node server.js` or standard startup scripts (e.g. `npm run start:server` / `npm run dev`) and monitor the terminal logs for success/failure.
