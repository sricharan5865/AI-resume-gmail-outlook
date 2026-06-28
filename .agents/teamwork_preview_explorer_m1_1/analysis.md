# Milestone 1: DB Schema Updates Analysis

This document details the analysis of the Candidate schema in `server/models.js` and provides a step-by-step strategy for adding the `hrQuestions` and `technicalQuestions` fields.

---

## 1. Summary of Findings
- The candidate schema is defined in `server/models.js` (lines 3-55) using Mongoose.
- To fulfill the Milestone 1 requirements, the schema needs two new array fields:
  - `hrQuestions`: An array of objects, each containing `question` and `answer` as strings.
  - `technicalQuestions`: An array of objects, each containing `question` and `answer` as strings.
- Since no candidates are pre-seeded in `server/db.json` (the `candidates` array is empty), no data migration script updates or changes to existing candidate data are required for this milestone.

---

## 2. Target File and Line Reference
- **File**: `server/models.js` (absolute path: `c:\Users\sri charan\Documents\projects\hr recruter\server\models.js`)
- **Target Lines**: Lines 46-47
- **Current Code**:
  ```javascript
  45:   seniorityLevel: { type: String, default: 'Mid' },
  46:   interviewQuestions: [String],
  47:   createdAt: { type: Date, default: Date.now },
  ```

---

## 3. Recommended Code Changes

### Proposed Modification in `server/models.js`
We will insert `hrQuestions` and `technicalQuestions` schemas between `interviewQuestions` and `createdAt`:

```javascript
<<<<
  interviewQuestions: [String],
  createdAt: { type: Date, default: Date.now },
====
  interviewQuestions: [String],
  hrQuestions: [
    {
      question: String,
      answer: String
    }
  ],
  technicalQuestions: [
    {
      question: String,
      answer: String
    }
  ],
  createdAt: { type: Date, default: Date.now },
>>>>
```

---

## 4. Implementation Strategy

1. **Modify Schema**: Locate `server/models.js` and modify lines 46-47 by replacing the target block with the proposed code snippet.
2. **Database Verification**: Since Mongoose models are built dynamically on start, running the application (e.g. `npm run dev` in `server`) will update the schema structure in MongoDB upon the next connection.
3. **Seed Cleanliness**: Verify `server/db.json` contains no active candidates to ensure that existing documents do not require schema translation or backfilling. (Already verified: `candidates` array is empty).

---

## 5. Potential Downstream Impacts (For Future Milestones)
- **M2 (Backend Parser Integration)**: `server/geminiParser.js` must be updated to structure parsed questions in `hrQuestions` and `technicalQuestions` instead of or in addition to `interviewQuestions`.
- **M3 (Backend API Routes)**: The endpoints in `server/server.js` (such as Candidate creation and regeneration endpoints) will need to save and return these new arrays.
- **M4 (Frontend UI)**: `client/src/components/CandidateDetails.jsx` and `client/src/App.jsx` will need to render the tabbed views using `candidate.hrQuestions` and `candidate.technicalQuestions`.
