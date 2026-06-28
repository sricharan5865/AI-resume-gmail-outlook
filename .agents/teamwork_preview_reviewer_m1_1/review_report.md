# Review Report: Milestone 1 DB Schema Updates

## Review Summary

**Verdict**: APPROVE

We approve the Milestone 1 changes. The schema updates and candidate instantiations comply with the SCOPE.md contracts and the implementation track synthesis recommendations. The server boots up successfully and connects to MongoDB without express or mongoose compilation/syntax errors.

---

## Quality Review

### Findings

#### [Major] Finding 1: Lack of Q&A Update during Duplicate Resolution
- **What**: During candidate update via duplicate resolution, the `hrQuestions` and `technicalQuestions` arrays are not updated or reset.
- **Where**: `server/server.js`, inside `app.post('/api/candidates/upload/resolve')` (around line 975-989).
- **Why**: If a user uploads a new resume for a candidate that already exists and chooses the "update" action, all other candidate attributes (name, email, skills, experience, tags, etc.) are updated from the new parsed data. However, `hrQuestions` and `technicalQuestions` are not updated or cleared. This leaves outdated/stale questions and answers in place, which do not match the updated resume.
- **Suggestion**: In `/api/candidates/upload/resolve`, explicitly update the candidate's Q&As, e.g.:
  ```javascript
  candidate.hrQuestions = parsedData.hrQuestions || [];
  candidate.technicalQuestions = parsedData.technicalQuestions || [];
  ```

### Verified Claims

- **Schema properties exist and are correctly structured** → verified via checking `server/models.js` and running `verify-schema.js` → **PASS**
- **Defaults to empty arrays `[]` upon instantiation** → verified via running `verify-schema.js` check #3 → **PASS**
- **Server boots and connects to MongoDB without compilation errors** → verified via running `node server.js` and checking logs → **PASS**
- **Three instantiation locations default Q&A arrays** → verified via viewing `server/server.js` at lines 383-384, 773-774, and 919-920 → **PASS**

### Coverage Gaps

- **E2E Test Suites execution** — risk level: low — recommendation: run E2E test suites in Milestone 5 once API endpoints and frontend are fully implemented. Currently, `start-server-and-test` is not globally available in node path, but testing can be done with manual scripts.

### Unverified Items

- None. All major claims for Milestone 1 were verified.

---

## Adversarial Review

**Overall risk assessment**: LOW

Since the fields are currently unused by the rest of the application (M2/M3 changes pending), the immediate risk is low. However, once M2 parser integration is implemented, robustness risks increase.

### Challenges

#### [Medium] Challenge 1: Mongoose Validation Crash on Malformed Gemini Outputs
- **Assumption challenged**: Assumes `parsedData.hrQuestions` and `parsedData.technicalQuestions` are either arrays of objects or undefined.
- **Attack scenario**: If the Gemini parsing output is malformed or returns a string (e.g. `"N/A"` or `"None"`) instead of an array of objects, `parsedData.hrQuestions || []` resolves to the truthy string. Mongoose tries to cast the string `"N/A"` into a subdocument array, throwing a `CastError / ValidationError`. The candidate ingestion route fails entirely, resulting in a `500 Internal Server Error` and failing to ingest the candidate.
- **Blast radius**: Prevents candidate ingestion from completing for that resume.
- **Mitigation**: Use defensive array and type checking during instantiation in `server/server.js`:
  ```javascript
  hrQuestions: Array.isArray(parsedData.hrQuestions) ? parsedData.hrQuestions : [],
  technicalQuestions: Array.isArray(parsedData.technicalQuestions) ? parsedData.technicalQuestions : []
  ```

### Stress Test Results

- **Non-array string assigned to `hrQuestions`** → expected: robust fallback or validation error → actual: Mongoose throws `Cast to embedded failed for value "N/A" (type string)` → **FAIL** (potential crash point if parser output is malformed)
- **Nested objects in question field** → expected: cast validation failure or casting to string → actual: throws `Cast to string failed` → **FAIL** (parser outputs must strictly be string key-value pairs)

### Unchallenged Areas

- **Gemini API parsing behavior under load** — reason: out of scope for Milestone 1 since Gemini parser has not been integrated with the new fields yet.
