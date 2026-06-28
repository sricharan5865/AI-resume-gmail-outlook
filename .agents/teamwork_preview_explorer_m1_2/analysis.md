# Analysis: DB Schema Updates (Milestone 1)

## Summary
The Candidate schema in `server/models.js` needs to be updated by adding two new array fields, `hrQuestions` and `technicalQuestions`, where each element is an object containing `question` and `answer` strings. This update is required to support the store and retrieval of AI-generated candidate Q&As as outlined in the project contracts.

---

## Findings

### Candidate Schema Context
- **Target File**: `server/models.js`
- **Location of Candidate Schema**: Line 3 to Line 55
- **Current Schema Definition**:
```javascript
const candidateSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  jobId: { type: String }, // null/empty means 'General Role'
  name: { type: String, required: true },
  ...
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

### Required Schema Extensions
To satisfy the requirements of Milestone 1, we must add:
1. `hrQuestions`: An array of objects with `question` (String) and `answer` (String) fields.
2. `technicalQuestions`: An array of objects with `question` (String) and `answer` (String) fields.

---

## Recommended Strategy

### Target Modification Location
The new fields should be placed within `candidateSchema` to maintain logical cohesion with other question-related fields (like `interviewQuestions`). The recommended target insertion point is immediately after `interviewQuestions: [String]` (line 46 in `server/models.js`).

### Exact Code Changes (Proposed Diff)

```markdown
File: server/models.js
Target lines for injection: Between line 46 and 47
```

**Before:**
```javascript
45:   seniorityLevel: { type: String, default: 'Mid' },
46:   interviewQuestions: [String],
47:   createdAt: { type: Date, default: Date.now },
```

**After:**
```javascript
45:   seniorityLevel: { type: String, default: 'Mid' },
46:   interviewQuestions: [String],
47:   hrQuestions: [
48:     {
49:       question: String,
50:       answer: String
51:     }
52:   ],
53:   technicalQuestions: [
54:     {
55:       question: String,
56:       answer: String
57:     }
58:   ],
59:   createdAt: { type: Date, default: Date.now },
```

---

## Impact & Downstream Considerations

1. **Database Migration**: 
   - Existing Candidate documents in the MongoDB database do not have these fields. Mongoose will automatically query these paths as `undefined` (or empty arrays if requested/configured) when loading existing documents.
   - If frontend components depend on `hrQuestions` or `technicalQuestions` being arrays, we should ensure they handle `undefined` safely or default them to `[]`.
2. **Backward Compatibility**:
   - The addition of these fields is fully backward-compatible as they do not change or break any existing schema attributes.
3. **Validation**:
   - The Mongoose schema will enforce that entries within these arrays, if populated, must follow the object structure with `question` and `answer` as strings.
