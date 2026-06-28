# Handoff Report: DB Schema Updates (Milestone 1)

## 1. Observation
In `server/models.js`, lines 3-55 define `candidateSchema` as:
```javascript
const candidateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  jobId: { type: String }, // null/empty means 'General Role'
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  linkedinUrl: { type: String },
  skills: [String],
  experience: [
    {
      role: String,
      company: String,
      duration: String,
      description: String
    }
  ],
  education: [
    {
      degree: String,
      institution: String,
      year: String
    }
  ],
  tags: [
    {
      value: String,
      category: String,
      confidence: Number
    }
  ],
  stage: { type: String, default: 'Inbox' },
  resumeUrl: { type: String },
  resumeText: { type: String, default: '' },
  matchScore: { type: Number, default: 0 },
  matchingSkills: [String],
  missingSkills: [String],
  matchExplanation: { type: String },
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
});
```

The file `PROJECT.md` specifies (lines 39-41):
```markdown
- `hrQuestions`: `[{ question: string, answer: string }]`
- `technicalQuestions`: `[{ question: string, answer: string }]`
```

Similarly, `.agents/sub_orch_impl/SCOPE.md` states (lines 22-24):
```markdown
- `hrQuestions`: `[{ question: String, answer: String }]`
- `technicalQuestions`: `[{ question: String, answer: String }]`
```

No test script is defined in `server/package.json` or `client/package.json`.

---

## 2. Logic Chain
1. Based on the observation of `candidateSchema` in `server/models.js`, the schema currently contains an array of strings called `interviewQuestions` (line 46) but lacks fields for structured HR and technical questions.
2. According to `PROJECT.md` and `SCOPE.md`, the candidate schema must support `hrQuestions` and `technicalQuestions` as arrays of objects containing `question` and `answer` fields.
3. In Mongoose, defining arrays of objects is done by nesting the object structure inside array brackets, e.g., `field: [{ nestedField: Type }]`.
4. To match the style and consistency of other array fields in `candidateSchema` (e.g., `experience`, `education`, and `tags`), the new fields should use:
   ```javascript
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
   ]
   ```
5. Inserting these fields between line 46 (`interviewQuestions`) and line 47 (`createdAt`) keeps all question-related properties group-localized, making the schema clean and organized.

---

## 3. Caveats
- **Existing Records**: Existing MongoDB candidate entries do not possess these fields. Running MongoDB queries against these fields will return undefined or an empty structure, depending on Mongoose version defaults. Data migration scripts or defaults in the application code may be necessary if downstream components expect these arrays to always exist.
- **Subdocument IDs**: Mongoose automatically generates `_id` values for elements inside subdocument arrays unless `{ _id: false }` is explicitly provided. Existing structures like `experience` and `education` in `candidateSchema` do not disable `_id` generation, so we assume subdocument IDs are acceptable/expected here too.

---

## 4. Conclusion
To complete Milestone 1, `candidateSchema` in `server/models.js` must be updated to include `hrQuestions` and `technicalQuestions` arrays of objects. The exact change requires adding the definition immediately below `interviewQuestions: [String]` (line 46).

---

## 5. Verification Method
1. **Compilation Check**: After implementing, verify that the Node server compiles and starts successfully with `npm run start` or `node server.js` within the `server` directory.
2. **Schema Verification Test**: Run a quick validation script to check schema validation. For instance, the implementer can execute a script like:
   ```javascript
   import mongoose from 'mongoose';
   import { Candidate } from './models.js';

   const testCandidate = new Candidate({
     id: 'test-id',
     name: 'Verification Candidate',
     hrQuestions: [{ question: 'Why?', answer: 'Because.' }],
     technicalQuestions: [{ question: 'Big O of O(1)?', answer: 'Constant.' }]
   });

   const err = testCandidate.validateSync();
   if (err) {
     console.error('Validation failed:', err);
     process.exit(1);
   } else {
     console.log('Validation passed successfully.');
     process.exit(0);
   }
   ```
3. **Invalidation conditions**: The verification fails if:
   - Mongoose errors are thrown when defining the fields in `candidateSchema`.
   - The fields `hrQuestions` or `technicalQuestions` are not correctly typed as arrays of objects containing `question` and `answer` strings.
