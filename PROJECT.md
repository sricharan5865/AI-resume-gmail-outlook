# Project: TalentFlow Questions & Answers Extension

## Architecture
The application uses a React (Vite) frontend and a Node/Express backend with a MongoDB database. Resume text parsing and question generation is handled by the Gemini AI integration using `google/gemini-2.5-flash`.

### Data Flow
1. Candidate resume uploaded (manual / email sourcing).
2. PDF text extracted in backend (`parser.js`).
3. Parser (`geminiParser.js`) queries Gemini model to parse metadata, experience, education, seniority level, and generates custom HR and Technical Q&As.
4. Candidate document saved to MongoDB including `hrQuestions` and `technicalQuestions`.
5. Frontend UI renders candidate details and displays HR and Technical Q&As in two separate tabs.
6. Regenerate button in UI calls `/api/candidates/:id/generate-questions` to regenerate and update the candidate document in MongoDB.

## Code Layout
- `server/models.js` — Candidate database schema definition.
- `server/geminiParser.js` — AI parsing logic and Q&A schema definition.
- `server/server.js` — Express API routing and candidate updates.
- `client/src/components/CandidateDetails.jsx` — Frontend details drawer showing Q&As.
- `client/src/App.jsx` — Frontend main dashboard managing state updates.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | E2E Testing Track | Create full opaque-box E2E test suite (Tiers 1-4) | None | IN_PROGRESS | e5381f42-c9c8-47c9-a7cc-2290d154a97f |
| 2 | DB Schema Updates (M1) | Add `hrQuestions` and `technicalQuestions` arrays to Candidate schema | None | IN_PROGRESS | 99fb4acf-4ab7-41e6-a7c8-08dc22078937 |
| 3 | Backend Parser Integration (M2) | Extend `geminiParser.js` to output HR & Tech Q&A from resumes | M1 | PLANNED | 99fb4acf-4ab7-41e6-a7c8-08dc22078937 |
| 4 | Backend API Routes (M3) | Add manual Q&A generation endpoint `/api/candidates/:id/generate-questions` | M2 | PLANNED | 99fb4acf-4ab7-41e6-a7c8-08dc22078937 |
| 5 | Frontend UI Integration (M4) | Add tabbed Q&A sections and manual regeneration button to UI | M3 | PLANNED | 99fb4acf-4ab7-41e6-a7c8-08dc22078937 |
| 6 | E2E test pass & adversarial validation (M5) | Integrate E2E test suite, pass all tests, run Tier 5 adversarial testing & auditor | M1, M4 | PLANNED | 99fb4acf-4ab7-41e6-a7c8-08dc22078937 |

## Interface Contracts
### Client ↔ Server
- **GET** `/api/candidates`
  - Returns: `Candidate[]`
- **POST** `/api/candidates/:id/generate-questions`
  - Returns: Updated `Candidate` object
  - Error: `404 Not Found` if candidate does not exist, `500 Internal Server Error` on API error.

### Schema Structure
- `hrQuestions`: `[{ question: string, answer: string }]`
- `technicalQuestions`: `[{ question: string, answer: string }]`
