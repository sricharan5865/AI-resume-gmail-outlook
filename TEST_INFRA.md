# E2E Test Infra: TalentFlow Q&A Extension

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Parser outputs HR Q&As and Technical Q&As on resume upload | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 2 | Regenerate endpoint generates/updates questions and answers | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest + start-server-and-test
- Execution flow:
  1. Starts test server on port 5001 using isolated DB `talentflow_test` and mocked external API responses (using preload script `tests/e2e/testServerEntry.js`).
  2. Runs Vitest tests in `tests/e2e`.
  3. Stops the test server.
- Test case format: Vitest spec files using native fetch for HTTP assertions and direct DB cleanup hooks.
- Directory layout:
  - `tests/e2e/`
    - `setup.js` (global database helper / mongoose connection setup)
    - `vitest.config.js` (Vitest config file)
    - `testServerEntry.js` (mock loader starting server with custom global fetch intercepts)
    - `resumeUpload.test.js` (Tier 1 & 2 tests for upload/parsing)
    - `regenerateQuestions.test.js` (Tier 1 & 2 tests for regeneration)
    - `combinations.test.js` (Tier 3 tests)
    - `scenarios.test.js` (Tier 4 tests)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete Recruitment Lifecycle | Job creation, Resume upload, Q&As check, Regenerate, GET Candidate | High |
| 2 | Email Ingestion Sourcing Lifecycle | Ingesting mock emails (or simulating resolver), Retrieve candidate, Tailor/Regenerate | High |
| 3 | Bulk Ingestion and Evaluation | Bulk upload, parsing checks, Score-based filtering, Stage update | High |
| 4 | Settings Change Regeneration | Resume upload, Update tag preferences settings, Regenerate, Tag checking | High |
| 5 | Job Update and Questions Sync | Job creation, Resume upload, Job details update, Regenerate questions | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
