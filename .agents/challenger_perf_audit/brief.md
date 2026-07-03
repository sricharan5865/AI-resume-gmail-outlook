# Challenger Brief - Performance & Correctness Verification

## Mission
Empirically verify that the MongoDB docker container runs, all E2E tests pass, and the application starts correctly.

## Scope of Verification
- **Database Startup**: Propose running `docker compose up -d mongodb` (from the project root) to start the database.
- **Test Suite Run**: Propose running `npm run test:e2e` (from the `server` folder) to execute all Vitest E2E tests and verify they pass.
- **Liveness & Lints**: Propose running the server and checking for syntax / runtime exceptions.

## Instructions
- Be patient when running terminal commands. Wait for user permission/approval.
- Do not bypass or mock tests. If a test fails, analyze why.
- Write your structured findings to `handoff.md` in your working directory `c:\Users\sri charan\Documents\projects\hr recruter\.agents\challenger_perf_audit\`.
