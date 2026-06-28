# Synthesis: DB Schema Updates (Milestone 1)

## Consensus
- **Schema Location**: The `Candidate` model schema is located in `server/models.js`.
- **Target Fields**:
  - `hrQuestions`: `[{ question: String, answer: String }]`
  - `technicalQuestions`: `[{ question: String, answer: String }]`
- **Insertion Point**: Directly after `interviewQuestions` field.
- **Candidate Instantiation**: In `server/server.js`, three candidate instantiation locations (sourcing from email, manual trigger, and manual upload) should explicitly set `hrQuestions` and `technicalQuestions` to `parsedData.hrQuestions || []` and `parsedData.technicalQuestions || []` to ensure consistency.

## Resolved Conflicts
- None. All explorers agree on schema syntax and modification points.

## Dissenting Views
- None.

## Gaps
- None.
