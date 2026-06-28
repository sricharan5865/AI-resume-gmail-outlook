# Handoff Report - TalentFlow Codebase Investigation & Test Infra Setup

## 1. Observation

### A. Server Configuration and Runtime (Scripts & Dependencies)
In `server/package.json`, we observe the following:
* **Scripts (lines 7-10)**:
  ```json
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
  ```
* **Project Type (line 6)**:
  ```json
  "type": "module"
  ```
* **Key Dependencies (lines 11-25)**:
  ```json
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^137.0.0",
    "imapflow": "^1.0.15",
    "mailparser": "^3.7.1",
    "mongoose": "^9.6.2",
    "multer": "^1.4.5-lts.1",
    "nodemailer": "^6.9.13",
    "pdf-parse": "^1.1.1",
    "pdf2json": "^4.0.3",
    "pdfjs-dist": "^3.11.174",
    "pdfkit": "^0.18.0"
  }
  ```

### B. MongoDB Container Status
Running the command `docker ps -a` on the host machine returned:
```text
CONTAINER ID   IMAGE          COMMAND                  CREATED       STATUS          PORTS                                              NAMES
7a8464259491   mongo:latest   "docker-entrypoint.s…"   3 weeks ago   Up 10 minutes   0.0.0.0:27017->27017/tcp, [::]:27017->27017/tcp    talentflow_mongo
```
This confirms that the MongoDB container is **already running** under the name `talentflow_mongo` on port `27017`.

In `server/server.js` (line 173), the connection string defaults to:
```javascript
mongoose.connect(process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017/talentflow?authSource=admin')
```
which matches the credentials declared in `docker-compose.yml`:
```yaml
MONGO_INITDB_ROOT_USERNAME: admin
MONGO_INITDB_ROOT_PASSWORD: password
```

### C. Candidate Model Fields
In `server/models.js`, lines 3-55 define the `candidateSchema`. We inspect this block and find the following regarding interview questions:
* **Current interviewQuestions field (line 46)**:
  ```javascript
  interviewQuestions: [String],
  ```
* **Missing fields**: Neither `hrQuestions` nor `technicalQuestions` fields are defined anywhere in `candidateSchema`.

### D. Generate-Questions Endpoint
Searching `server/server.js` for `generate-questions` yielded no results. The list of candidate-related endpoints currently implemented in `server/server.js` is:
* `POST /api/candidates/extract-gmail` (line 653)
* `POST /api/candidates/upload` (line 819)
* `POST /api/candidates/upload/resolve` (line 945)
* `GET /api/candidates` (line 1099)
* `DELETE /api/candidates/:id` (line 1103)
* `PATCH /api/candidates/:id/stage` (line 1137)
* `POST /api/candidates/:id/send-email` (line 1155)

The `/api/candidates/:id/generate-questions` endpoint is **not implemented**.

### E. Relevant Documentation
We found the following key documentation files:
1. `PROJECT.md` at the project root: Outlines the architecture, data flow, milestones, and interface contracts.
   * Confirms `hrQuestions` and `technicalQuestions` are expected to be arrays of objects in the form: `[{ question: string, answer: string }]` (lines 40-41).
   * Identifies Milestone 2 (DB Schema Updates) and Milestone 4 (Backend API Routes for `/api/candidates/:id/generate-questions`) as pending.
2. `PROJECT_HANDOVER_GUIDE.md` at the project root: Explains stack components, production URLs/settings, and local startup methods.
3. `OLLAMA_NETWORK_SETUP.md` at the project root: Guides how to offload local LLM processing to Ollama on another machine.

---

## 2. Logic Chain

1. **Server execution & dependencies**: From `server/package.json`, we observe that the backend runs via `node server.js` and uses Express, Mongoose, and Gemini API. The codebase uses modern ES Module syntax (`"type": "module"`), meaning our test suite must natively support or transpile ES Modules.
2. **MongoDB Container**: The output of `docker ps -a` shows `talentflow_mongo` with status `Up 10 minutes`, which means we do not need to run `docker-compose up` to start the DB, as it is already active.
3. **Database Schema**: Comparing the required `hrQuestions` and `technicalQuestions` fields from the `PROJECT.md` contract with `server/models.js`, we see the model lacks these fields, having only a flat array of strings `interviewQuestions: [String]`. This aligns with the fact that Milestone 2 (DB Schema Updates) is currently pending implementation.
4. **Endpoint implementation**: Our search in `server/server.js` showed that the route `/api/candidates/:id/generate-questions` is absent. This aligns with the fact that Milestone 4 (Backend API Routes) is planned but not yet implemented.
5. **Testing Framework Recommendation**:
   * Because the server uses Native ES Modules (`"type": "module"`), configuring older frameworks (like Jest) requires experimental Node flags and custom setups.
   * **Vitest** provides native ESM support out-of-the-box, is extremely fast, and maintains high API compatibility with Jest. Since the frontend is already built on Vite, using Vitest keeps the tooling unified.
   * **Supertest** can make requests to Express apps, but because `server.js` immediately calls `app.listen()` instead of exporting the `app` instance, we cannot easily import it. Therefore, running E2E tests requires starting the server as a separate process.
   * **start-server-and-test** is a standard utility that automates this lifecycle by spawning the server, waiting for a specific URL (like port `5001`), running the test command, and cleaning up the process afterward.
   * **MSW (Mock Service Worker)** is recommended to intercept outbound LLM requests to `openrouter.ai` or Gemini endpoints, making the tests local, deterministic, and free.

---

## 3. Caveats

* **Network isolation**: The investigation was conducted in `CODE_ONLY` mode, so we did not attempt to hit the OpenRouter API or verify actual network roundtrips to the LLM. However, we analyzed the source code to see how they are implemented.
* **Tesseract OCR dependency**: `PROJECT_HANDOVER_GUIDE.md` indicates a Python OCR fallback script exists. If E2E tests trigger OCR, the host machine must have Python 3 and Tesseract-OCR installed.

---

## 4. Conclusion

1. The Node server is run using `npm run start` or `npm run dev` and uses Express/Mongoose.
2. The MongoDB container `talentflow_mongo` is already running on port 27017, so starting it via docker-compose is unnecessary.
3. The Candidate model in `server/models.js` is missing the `hrQuestions` and `technicalQuestions` fields, and the `/api/candidates/:id/generate-questions` endpoint is not implemented in `server/server.js`.
4. **Vitest** is recommended as the testing framework.

---

## 5. Recommended E2E Test Setup & Runner Configuration

### A. Test Scripts Configuration in `server/package.json`
We recommend adding the following scripts:
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "start:test": "cross-env PORT=5001 MONGO_URI=mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin node server.js",
  "test:e2e": "start-server-and-test start:test http://localhost:5001/api/auth/status test:run",
  "test:run": "vitest run --dir tests/e2e"
}
```
* `start:test`: Launches the server on port `5001` using a separate isolated database `talentflow_test` so test data does not contaminate the development database.
* `test:e2e`: Orchestrates the server lifecycle, waiting for the server to be ready on port 5001 before starting Vitest, and tearing down the server process when tests finish.

### B. Standard E2E Database Hook Template
Inside E2E test files (e.g., `tests/e2e/generateQuestions.test.js`), use Mongoose hooks to clean the DB before/after tests:
```javascript
import { beforeAll, beforeEach, afterAll, describe, test, expect } from 'vitest';
import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://admin:password@localhost:27017/talentflow_test?authSource=admin';

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  // Clear collections to ensure test isolation
  await mongoose.connection.db.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});
```

### C. Mocking External LLM APIs (Opaque-Box E2E Isolation)
Using **MSW (Mock Service Worker)** in `tests/e2e/setup.js` to intercept calls to OpenRouter/Gemini ensures E2E tests run quickly, offline, and reliably:
```javascript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  http.post('https://openrouter.ai/api/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Test Candidate",
            email: "test@example.com",
            skills: ["JavaScript", "HTML"],
            experience: [],
            education: [],
            seniorityLevel: "Junior",
            hrQuestions: [
              { question: "Tell me about yourself.", answer: "Sample HR answer." }
            ],
            technicalQuestions: [
              { question: "Explain closures.", answer: "Sample Tech answer." }
            ]
          })
        }
      }]
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 6. Verification Method

To verify these findings manually:
1. **MongoDB Container**: Run `docker ps` to verify that `talentflow_mongo` is running.
2. **Missing Fields**: Open `server/models.js` and verify that `hrQuestions` and `technicalQuestions` are not defined in `candidateSchema`.
3. **Missing Endpoint**: Run `git grep "generate-questions" server/` to confirm that the endpoint is not present in the backend codebase.
