# Handoff Report - Candidate Stage Guard & Screening Question Enhancements

This report provides a read-only analysis of the candidate stage change endpoint in `server/server.js` and the HR question mapping/prompt section 5 in `server/geminiParser.js`.

---

## 1. Observation

### Candidate Stage PATCH Endpoint
We observed the candidate stage change endpoint in `server/server.js` (lines 1792-1808):
```javascript
1792: app.patch('/api/candidates/:id/stage', async (req, res) => {
1793:   try {
1794:     const { stage } = req.body;
1795:     const candidate = await Candidate.findOne({ id: req.params.id });
1796:     if (!candidate) return res.status(404).json({ error: 'Not found.' });
1797: 
1798:     const oldStage = candidate.stage;
1799:     candidate.stage = stage;
1800:     candidate.history.push({ date: new Date().toISOString(), type: 'StageChanged', text: `Moved from "${oldStage}" to "${stage}"` });
1801:     
1802:     await candidate.save();
1803:     res.json(candidate);
1804:   } catch (error) {
1805:     console.error('Failed to change candidate stage:', error);
1806:     res.status(500).json({ error: error.message });
1807:   }
1808: });
```

### HR Question Mapping
We observed the function `mapAnalysisToQuestions(parsedData)` in `server/geminiParser.js` (lines 757-786):
```javascript
757: function mapAnalysisToQuestions(parsedData) {
758:   let hrQuestions = [];
759:   let technicalQuestions = [];
760: 
761:   // 1. Map Career Gaps to HR
762:   if (parsedData.career_gaps && Array.isArray(parsedData.career_gaps)) {
763:     parsedData.career_gaps.forEach(gap => {
764:       if (gap.interview_question && gap.sample_answer) {
765:         hrQuestions.push({
766:           question: gap.interview_question,
767:           answer: gap.sample_answer,
768:           importance: 'MUST ASK'
769:         });
770:       }
771:     });
772:   }
773: 
774:   // 2. Map HR Questions to HR
775:   if (parsedData.hr_questions && Array.isArray(parsedData.hr_questions)) {
776:     parsedData.hr_questions.forEach(q => {
777:       if (q.question && q.sample_answer) {
778:         hrQuestions.push({
779:           question: q.question,
780:           answer: q.sample_answer,
781:           importance: 'GOOD TO ASK'
782:         });
783:       }
784:     });
785:   }
```
And the slicing/fallback logic (lines 830-850):
```javascript
830:   // Slice or fill to exactly 7 HR questions
831:   if (hrQuestions.length > 7) {
832:     hrQuestions = hrQuestions.slice(0, 7);
833:   } else {
834:     const defaultHr = [
835:       { question: "Tell me about your background and how it prepares you for this role?", answer: "I have a solid foundation in my field, have successfully delivered key projects in my previous roles, and quickly adapt to new stacks.", importance: "OPTIONAL" },
836:       { question: "Why are you interested in joining our company?", answer: "I admire your company's innovation, culture, and project scale, and believe my skills align perfectly with your team's goals.", importance: "OPTIONAL" },
837:       { question: "Describe a challenging situation at work and how you resolved it.", answer: "I faced a critical bug/blocker, analyzed the root cause, collaborated with the team, and deployed a resolution under pressure.", importance: "OPTIONAL" },
...
842:     ];
843:     let idx = 0;
844:     while (hrQuestions.length < 7 && idx < defaultHr.length) {
845:       if (!hrQuestions.some(q => q.question === defaultHr[idx].question)) {
846:         hrQuestions.push(defaultHr[idx]);
847:       }
848:       idx++;
849:     }
850:   }
```

### Recruiter System Prompt Section 5
We observed the prompt section 5 for Ollama and Gemini (lines 885, 913-914):
- Ollama:
```javascript
885: 5. HR & Behavioral: Generate EXACTLY 7 standard HR questions personalized with resume facts, plus model answers.
```
- Gemini:
```javascript
913: ### 5. HR & Behavioral Readiness
914: - Generate EXACTLY 7 standard HR questions, personalized with the candidate's actual details: tell me about yourself; reason for leaving most recent company; reason for seeking a new role; expected compensation; why hire you; key strengths; 5-year vision. Provide sample answers built from the candidate's actual resume facts.
```

---

## 2. Logic Chain

### Candidate Stage Guard
1. In `server/server.js`, whenever `app.patch('/api/candidates/:id/stage')` is called, the server performs a database fetch, appends a history item (`StageChanged` type), and calls `candidate.save()`.
2. If `req.body.stage` matches `candidate.stage` (which is the current stage), this database update and history entry is redundant.
3. Therefore, adding a guard `if (oldStage === stage) { return res.json(candidate); }` immediately after retrieving the candidate short-circuits the flow, preventing the write operation and returning the unchanged candidate document directly.

### Screening Question Prepending and AI-Generated Question Appending
1. The current implementation in `server/geminiParser.js` collects all questions, slices them to a maximum of 7, and fills the remaining slots using generic default HR questions.
2. The user request requires that the 7 fixed screening questions (currently in the `defaultHr` array) always be prepended, and up to 7 personalized AI-generated questions be appended, resulting in exactly 14 questions total.
3. To achieve this, the 7 screening questions are extracted into a `fixedScreening` array.
4. AI-generated questions (from gaps and AI-generated HR questions) are collected into a separate `personalizedHrQuestions` array.
5. `personalizedHrQuestions` is sliced to 7. If it has fewer than 7 elements, we pad it with fallback behavioral questions (excluding the 7 prepended ones) to guarantee a consistent length of exactly 7 questions.
6. The combined list is constructed as `[...fixedScreening, ...slicedPersonalized]`, ensuring it has exactly 14 questions total.
7. To avoid redundancy between the prepended generic questions and the AI's output, prompt section 5 must be modified to request *personalized* candidate-specific questions (focusing on projects, transitions, or achievements) rather than generic standard ones (like "tell me about yourself" or "salary expectations").

---

## 3. Caveats

- **MongoDB Instance**: The analysis assumes that the database schema allows for up to 14 elements in the `hrQuestions` array (which it does, since Mongoose arrays have no fixed size limit unless validated otherwise).
- **AI Prompt Non-Deterministic Output**: Even though prompt section 5 requests exactly 7 personalized questions, the AI may occasionally return fewer. The fallback array logic mitigates this non-determinism, ensuring that the total question count is always exactly 14.

---

## 4. Conclusion

We have proposed precise edits to `server/server.js` and `server/geminiParser.js` to address both requirements. These edits are structured as patch files in `.agents/teamwork_preview_explorer_enh_2/`.

### Summary of Changes

| Target File | Change Location | Description |
| --- | --- | --- |
| `server/server.js` | Around line 1798 | Insert `if (oldStage === stage) { return res.json(candidate); }` to short-circuit stage updates. |
| `server/geminiParser.js` | `mapAnalysisToQuestions` | Define `fixedScreening`, accumulate AI-generated questions into `personalizedHrQuestions`, slice/pad to 7, and combine them. |
| `server/geminiParser.js` | Prompt Section 5 | Update prompt to ask for 7 candidate-specific personalized questions instead of generic ones. |

---

## 5. Verification Method

To verify these changes:
1. Apply the patch files:
   ```powershell
   git apply .agents/teamwork_preview_explorer_enh_2/server.patch
   git apply .agents/teamwork_preview_explorer_enh_2/geminiParser.patch
   ```
2. Run E2E test scenarios to ensure that the server starts and basic API behaviors are not broken:
   ```powershell
   cd tests/e2e
   npm test
   ```
3. Specifically test the stage change guard by calling PATCH `/api/candidates/:id/stage` twice with the same stage, verifying that the candidate document returned is unchanged and no duplicate history item is created.
4. Upload a new resume or trigger a question regeneration, and check the candidate's `hrQuestions` field in the database. Ensure it contains exactly 14 questions, where the first 7 are the fixed screening questions and the next 7 are personalized AI-generated questions.
