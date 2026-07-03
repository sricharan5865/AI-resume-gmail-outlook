# Original User Request

## Follow-up — 2026-07-02T16:47:38Z

Optimize local Ollama setups to eliminate performance bottlenecks and reduce latency for long prompts, ensuring immediate delivery of actionable solutions.

Working directory: c:\Users\sri charan\Documents\projects\hr recruter

## Requirements

### R1. System Configurations Audit
Create optimization guidelines and configuration modifications to tune Ollama system service parameters (e.g., systemd environment settings, thread count, batch sizing, context settings) for local GPU/CPU hardware.

### R2. Context Window and Prompt Compression Logic
Design and write modular utility code to dynamically compress prompts and optimize context windows (`num_ctx`, `num_predict`) for any custom LLM pipelines running on local instances.

## Acceptance Criteria

### Execution & Performance
- [ ] Prompt pre-processing latency is reduced by at least 50% for typical resume processing payloads.
- [ ] System handles inputs without memory/VRAM exhaustion on standard hardware.
- [ ] Configuration scripts/files are fully verified and ready for deployment.
