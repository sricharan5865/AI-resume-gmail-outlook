# Original User Request

## Initial Request — 2026-06-15T21:08:44+05:30

Extend the TalentFlow recruitment automation platform to generate two separate lists of questions and answers (one for HR questions, and one for Technical questions) when a candidate's resume is analyzed, storing them in the database and showing them in the UI.

Working directory: c:\Users\sri charan\Documents\projects\hr recruter
Integrity mode: development

## Requirements

### R1. DB Schema Update
- Extend the Candidate database schema to store two separate arrays/structures of Q&As:
  - `hrQuestions`: A list of questions and answers focused on HR, cultural fit, and behavioral aspects.
  - `technicalQuestions`: A list of questions and answers focused on technical skills, experience, and domain knowledge.

### R2. Backend Parser Integration
- Integrate the Q&A generation into the existing backend parser (geminiParser.js) using the configured Gemini model (`google/gemini-2.5-flash`).
- When a resume is analyzed, ask the LLM to generate custom HR and Technical Q&As based on the resume content.
- Provide a backend API endpoint `/api/candidates/:id/generate-questions` to allow generating/regenerating the Q&As for existing candidates.

### R3. Frontend UI Integration
- Update the candidate's profile/detail view in the client UI to present the HR questions & answers and Technical questions & answers in two clean, distinct sections or tabs.
- Add a button in the UI to trigger regeneration/generation of the questions for an existing candidate.

## Acceptance Criteria

### Schema & Data Storage
- [ ] Database Schema stores `hrQuestions` and `technicalQuestions` (each containing `question` and `answer` fields).
- [ ] A candidate's document in MongoDB populated after parser execution contains non-empty lists for both categories.

### Parser & API Execution
- [ ] Uploading a new resume successfully generates and saves both HR and Technical Q&As.
- [ ] Calling `/api/candidates/:id/generate-questions` updates the candidate document with newly generated Q&As.

### UI Delivery
- [ ] Candidate detail page displays "HR Questions & Answers" and "Technical Questions & Answers" in separate sections.
- [ ] The UI allows requesting a manual regeneration of these questions for the active candidate.
