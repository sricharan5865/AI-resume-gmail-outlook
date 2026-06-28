# Scope: Implementation Track

## Architecture
The application uses a React (Vite) frontend, a Node/Express backend, and a MongoDB database.
Resume parsing and question generation use the Gemini API with `google/gemini-2.5-flash`.

- **Database (`server/models.js`)**: Stores candidates. Needs schema updates for Q&As.
- **Parsing (`server/geminiParser.js`)**: Runs OCR/text extraction and parses metadata using Gemini API, now generating HR and Technical Q&As.
- **API (`server/server.js`)**: Routes requests, handles candidates list and updates. Needs a new route for regeneration.
- **Frontend (`client/src/components/CandidateDetails.jsx`, `client/src/App.jsx`)**: Renders candidates, needs tabs for Q&As, a button to regenerate them, and state updates.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | DB Schema Updates (M1) | Add `hrQuestions` and `technicalQuestions` arrays to Candidate schema in `server/models.js` | None | IN_PROGRESS |
| 2 | Backend Parser Integration (M2) | Integrate HR & Tech Q&A generation into `server/geminiParser.js` using `google/gemini-2.5-flash` | M1 | PLANNED |
| 3 | Backend API Routes (M3) | Implement POST `/api/candidates/:id/generate-questions` in `server/server.js` | M2 | PLANNED |
| 4 | Frontend UI Integration (M4) | Modify `CandidateDetails.jsx` and `App.jsx` to render Q&As in tabs and handle regeneration | M3 | PLANNED |
| 5 | E2E Test & Adversarial Validation (M5) | Check for `TEST_READY.md`, pass Tiers 1-4, run Tier 5 adversarial testing & auditor | M4 | PLANNED |

## Interface Contracts
### Database Schema
- `hrQuestions`: `[{ question: String, answer: String }]`
- `technicalQuestions`: `[{ question: String, answer: String }]`

### API Endpoint
- **POST** `/api/candidates/:id/generate-questions`
  - Response: JSON representation of the updated Candidate object
  - Error: `404 Not Found` if candidate does not exist, `500 Internal Server Error` on failure.
