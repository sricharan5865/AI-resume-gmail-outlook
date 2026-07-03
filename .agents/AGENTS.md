# TalentFlow Project Custom Rules

## 1. LLM Token Configuration & Output Integrity
- **High Output Limits**: When requesting structured recruiter analysis or comprehensive interview question banks, always set `max_tokens` (or `maxOutputTokens`) to at least `8000` (or `8192`) across all providers (OpenRouter, Gemini, Claude). This prevents token truncation which results in invalid JSON / `Unexpected end of JSON input` errors.

## 2. Duplicate Candidate Resolution Flow
- **Four Resolution Options**: Whenever a duplicate candidate is detected during manual or automated resume uploads, the system must offer the user exactly four options:
  1. **Update (Overwrite Existing Info & CV)**: Retain the candidate ID, overwrite the existing database details, and update the resume.
  2. **Delete Existing & Import New**: Delete the old candidate profile (including files and indices) first, and then parse and import the new resume as a fresh candidate.
  3. **Delete Existing Only (Halt Import)**: Delete the existing candidate from the system, and do not import the new file.
  4. **Cancel (Discard Uploaded File)**: Discard the incoming file and leave the database unmodified.

## 3. Preserving Code & Web Pages
- **Do Not Delete or Overwrite Web Pages**: Never delete, prune, or completely overwrite previously created web pages, layout components, views, or routing files unless the user explicitly requests you to delete or remove them. Always preserve existing UI pages and functionality.

## 4. Ollama Integration & Optimization Guide
- **Dynamic Prompt Compression**: When sending requests to local Ollama endpoints, dynamically condense system instructions and schema descriptions. Avoid sending verbose cloud-optimized prompts (>800 tokens) to prevent high prompt pre-processing latency.
- **Explicit Parameter Tuning**: Always configure `num_ctx` (context size) and `num_predict` (completion limit) explicitly based on the task:
  - Complex generation (e.g., resume parsing): `num_ctx: 8192`, `num_predict: 2048`
  - Simple classification/indexing: `num_ctx: 2048`, `num_predict: 256`
- **Short Timeout Wrappers**: Ensure connection tests and status checks to local services use short, client-safe timeouts (e.g., 10 seconds) to avoid thread blocking or frontend freezes.
- **JSON Format Resilience**: Always include format validation and a JSON repair utility (like bracket-matching and quotes escaping) when parsing local model outputs, as they are more prone to minor syntax formatting errors than cloud models.
