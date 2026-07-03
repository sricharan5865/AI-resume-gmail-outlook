# Project: TalentFlow Ollama and Database Performance Audit

## Architecture
The performance audit targets the local Ollama LLM interactions and MongoDB database model optimizations:
- `server/emailCategorizer.js`: Ollama chat endpoint for email categorization. Focus: increase timeout, optimize `num_ctx` (down to 2048) and `num_predict` (down to 256) to prevent high latency/VRAM exhaustion.
- `server/embeddingService.js`: Ollama embed endpoint. Focus: increase timeout from 30s to 180s.
- `server/geminiParser.js`: Ollama chat endpoint for resume parsing. Focus: optimize parameters for local/GPU environments.
- `server/server.js`: Ollama connection testing `/api/ollama/test-connection`. Focus: add a 5-10s timeout wrapper to prevent hanging indefinitely. Ensure returnDocument usage validation.
- `server/models.js`: Candidate schema. Focus: add indexes for `jobId` and `assignedTo` to fix query performance bottlenecks.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | Exploration & Audit | Investigate integration points and tests | None | DONE | fe0066bf-1929-4f9f-b031-03567412df19 |
| 2 | Implementation | Apply timeout configurations, parameter downscaling, connection test timeout, and schema indexes | M1 | DONE | 85995af6-92ba-454c-98f1-d4801ce7e1c8 |
| 3 | Code Review | Review implementation correctness and layout conformity | M2 | DONE | 83d20fd0-fc05-425b-86c5-b0c27a44a837 |
| 4 | Verification & Audit | Verification via Challenger and Forensic Auditor | M3 | DONE | 97d6ecba-c769-42c8-bb4c-c2f46f1af70b |
| 5 | Test suite & server validation | Run test suite and check dev server functionality | M4 | DONE | 5f810bee-b962-49e6-b788-19240dd2809f |

## Code Layout
- `server/emailCategorizer.js` - Email categorization logic with Ollama timeout & parameter options.
- `server/embeddingService.js` - Text embedding generator with Ollama timeout.
- `server/geminiParser.js` - Resume parsing parameters.
- `server/server.js` - Connection test endpoint and Express controllers.
- `server/models.js` - Database models and schemas.

## Interface Contracts
### Client ↔ Server
- **GET** `/api/ollama/test-connection`
  - Returns: `{ success: boolean, ... }`
  - Error: 504 / timeout error after 5-10 seconds if Ollama is unreachable, rather than hanging indefinitely.
