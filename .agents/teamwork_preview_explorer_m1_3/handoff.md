# Handoff Report - Milestone 1: DB Schema Updates

## 1. Observation
We directly examined `server/models.js` and `server/server.js` using local search and file viewing tools.

### `server/models.js` Schema Definition (Lines 45-48)
```javascript
45:   seniorityLevel: { type: String, default: 'Mid' },
46:   interviewQuestions: [String],
47:   createdAt: { type: Date, default: Date.now },
```
Other nested array structures in the same file (e.g., `experience`, `education`, `tags`) use standard subdocument array notations:
```javascript
11:   experience: [
12:     {
13:       role: String,
14:       company: String,
15:       duration: String,
16:       description: String
17:     }
18:   ],
```

### `server/server.js` Candidate Instantiations
We observed three points where new `Candidate` records are created and saved:
1. **Location A** (Lines 380-384):
   ```javascript
   380:       comments: '',
   381:       seniorityLevel: parsedData.seniorityLevel || 'Mid',
   382:       interviewQuestions: parsedData.interviewQuestions || [],
   383:       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
   384:     });
   ```
2. **Location B** (Lines 768-772):
   ```javascript
   768:       comments: '',
   769:       seniorityLevel: parsedData.seniorityLevel || 'Mid',
   770:       interviewQuestions: parsedData.interviewQuestions || [],
   771:       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
   772:     });
   ```
3. **Location C** (Lines 912-916):
   ```javascript
   912:       comments: '',
   913:       seniorityLevel: parsedData.seniorityLevel || 'Mid',
   914:       interviewQuestions: parsedData.interviewQuestions || [],
   915:       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
   916:     });
   ```

---

## 2. Logic Chain
1. To satisfy the Milestone 1 requirements, the candidate database schema needs to support two new arrays of subdocuments: `hrQuestions` and `technicalQuestions`.
2. Each array must contain objects with `question` and `answer` fields of type `String`.
3. To implement this in `server/models.js`, we can add the fields directly to `candidateSchema`. Placing them between `interviewQuestions` (line 46) and `createdAt` (line 47) ensures they are logically grouped with other screening fields (like `interviewQuestions`).
4. Using the consistent format `[{ question: String, answer: String }]` maintains syntax parity with existing subdocument arrays like `experience` and `education` in the same file.
5. In Mongoose, array fields automatically default to empty arrays `[]` upon instantiation. However, to guarantee consistency and align with the existing code structure in `server/server.js` (which explicitly sets `interviewQuestions: parsedData.interviewQuestions || []`), it is recommended to explicitly set `hrQuestions` and `technicalQuestions` to `parsedData.hrQuestions || []` and `parsedData.technicalQuestions || []` during the three `new Candidate(...)` calls in `server/server.js`.

---

## 3. Caveats
- We did not check if there is an active MongoDB instance running, but we verified the mongoose connection string in `migrateData.js` (`mongodb://admin:password@localhost:27017/talentflow?authSource=admin`).
- There are no existing automated tests in the backend, meaning verification must be manual or rely on E2E test scripts once established by the E2E Testing Orchestrator (refer to `sub_orch_e2e/progress.md`).

---

## 4. Conclusion
We recommend modifying the `Candidate` schema in `server/models.js` and updating the candidate creation pathways in `server/server.js` as detailed in the proposed changes below.

### Proposed Diff for `server/models.js`
```diff
@@ -46,3 +46,15 @@
   interviewQuestions: [String],
+  hrQuestions: [
+    {
+      question: String,
+      answer: String
+    }
+  ],
+  technicalQuestions: [
+    {
+      question: String,
+      answer: String
+    }
+  ],
   createdAt: { type: Date, default: Date.now },
```

### Proposed Diffs for `server/server.js`

#### Location A (Lines 380-384)
```diff
@@ -381,4 +381,6 @@
       seniorityLevel: parsedData.seniorityLevel || 'Mid',
       interviewQuestions: parsedData.interviewQuestions || [],
+      hrQuestions: parsedData.hrQuestions || [],
+      technicalQuestions: parsedData.technicalQuestions || [],
       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
```

#### Location B (Lines 768-772)
```diff
@@ -769,4 +769,6 @@
       seniorityLevel: parsedData.seniorityLevel || 'Mid',
       interviewQuestions: parsedData.interviewQuestions || [],
+      hrQuestions: parsedData.hrQuestions || [],
+      technicalQuestions: parsedData.technicalQuestions || [],
       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
```

#### Location C (Lines 912-916)
```diff
@@ -913,4 +913,6 @@
       seniorityLevel: parsedData.seniorityLevel || 'Mid',
       interviewQuestions: parsedData.interviewQuestions || [],
+      hrQuestions: parsedData.hrQuestions || [],
+      technicalQuestions: parsedData.technicalQuestions || [],
       history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
```

---

## 5. Verification Method
1. Start the MongoDB database using the Docker Compose setup at the project root (`docker-compose up -d`).
2. Run the server using `npm run dev` or `node server.js` from the `server` directory.
3. Call the upload API or import a candidate manually (e.g., through the frontend or by sending a request to the server API).
4. Run a MongoDB query (e.g., using `mongosh` or a script) on the `candidates` collection to verify that candidate documents now include `hrQuestions: []` and `technicalQuestions: []` by default:
   ```javascript
   db.candidates.find({}, { name: 1, hrQuestions: 1, technicalQuestions: 1 })
   ```
5. Confirm that existing files and routes still execute without error when accessing the Candidate model.
