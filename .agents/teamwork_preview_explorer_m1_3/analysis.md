# Milestone 1: DB Schema Updates - Analysis

## Executive Summary
This analysis details the DB Schema Updates required for Milestone 1. The objective is to extend the MongoDB `Candidate` model schema in `server/models.js` to store custom HR and Technical Questions and Answers (Q&As). This will support subsequent milestones: generating Q&As via the Gemini AI integration (Milestone 2), exposing the generation API endpoints (Milestone 3), and displaying them in separate tabs in the frontend dashboard UI (Milestone 4).

---

## 1. Candidate Schema Investigation

The `Candidate` model is defined in `server/models.js`. 

### Current Schema State (`server/models.js` - Lines 40-55)
```javascript
  ownCategoryScore: { type: Number, default: 0 },
  ownCategoryMatchingSkills: [String],
  ownCategoryMissingSkills: [String],
  ownCategoryExplanation: { type: String },
  comments: { type: String },
  seniorityLevel: { type: String, default: 'Mid' },
  interviewQuestions: [String],
  createdAt: { type: Date, default: Date.now },
  history: [
    {
      date: String,
      type: { type: String },
      text: String
    }
  ]
```

### Required Fields
The updated schema needs to support two new arrays of subdocuments:
1. `hrQuestions`: An array of objects, where each object contains a `question` string and an `answer` string.
2. `technicalQuestions`: An array of objects, where each object contains a `question` string and an `answer` string.

---

## 2. Proposed Changes

### Change 1: `server/models.js` Candidate Schema Definition
Insert the two new arrays into the `candidateSchema` definition. We recommend inserting them right after `interviewQuestions` to keep related fields grouped.

**Consistency Check**:
Other arrays of objects (like `experience`, `education`, and `tags`) in `candidateSchema` use the shorthand declaration format for properties (e.g., `role: String`). We will follow this standard for consistency.

**Before (`server/models.js` - Lines 45-48):**
```javascript
  seniorityLevel: { type: String, default: 'Mid' },
  interviewQuestions: [String],
  createdAt: { type: Date, default: Date.now },
```

**After (Proposed):**
```javascript
  seniorityLevel: { type: String, default: 'Mid' },
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
```

---

### Change 2: `server/server.js` Candidate Instantiations (Optional but Recommended)
To prevent `undefined` values and ensure the fields are explicitly initialized as empty arrays `[]` when a new Candidate is created, we recommend adding them to the initialization block where new `Candidate` instances are constructed.

There are three locations in `server/server.js` where `new Candidate({ ... })` is called:

#### Location A: Automated Email Polling Sourcing (`server/server.js` - Lines 380-384)
**Before:**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
```
**After (Proposed):**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported from email attachment: ${filename}` }]
```

#### Location B: Manual Email Trigger Sourcing (`server/server.js` - Lines 768-772)
**Before:**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
```
**After (Proposed):**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Imported via manual trigger: ${filename}` }]
```

#### Location C: Manual Resume PDF Upload Sourcing (`server/server.js` - Lines 912-916)
**Before:**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
```
**After (Proposed):**
```javascript
      comments: '',
      seniorityLevel: parsedData.seniorityLevel || 'Mid',
      interviewQuestions: parsedData.interviewQuestions || [],
      hrQuestions: parsedData.hrQuestions || [],
      technicalQuestions: parsedData.technicalQuestions || [],
      history: [{ date: new Date().toISOString(), type: 'Imported', text: `Manual upload: ${req.file.originalname}` }]
```

---

## 3. Impact & Risk Analysis

- **Mongoose Array Defaults**: Mongoose automatically initializes empty arrays for fields declared as nested document arrays (e.g. `[Schema]` or `[{ ... }]`), which guarantees backward compatibility with existing candidates in the database. When queried, existing candidates will return empty arrays `[]` for `hrQuestions` and `technicalQuestions` instead of `undefined`, preventing frontend type errors.
- **Migration Script Compatibility**: `server/migrateData.js` imports candidates from `db.json` using an upsert mechanism (`Candidate.updateOne({ id: candidate.id }, { $set: candidate }, { upsert: true })`). Since `db.json` contains no candidates under `"candidates": []`, the migration has zero data conflicts.
- **Verification Strategy**: The changes can be verified by importing a test resume manually or through email and inspecting the candidate document structure in MongoDB to ensure `hrQuestions` and `technicalQuestions` are present as empty arrays.
