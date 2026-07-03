# Project: Ollama Setup Optimization

## Architecture
- Local Ollama setup integrated into Node.js backend.
- High prompt pre-processing latency due to verbose system prompts.
- Needs dynamic prompt compression and explicit parameter tuning (`num_ctx`, `num_predict`).
- Needs system service optimization guidelines (systemd, hardware threads, batch size, etc.).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | System Configurations Audit | Audit Ollama settings, prepare optimization guidelines (threads, batch size, memory tuning) | None | PLANNED |
| 2 | Prompt Compression Utility | Design and write modular prompt compression & explicit parameter tuning utility (`ollamaOptimizer.js`) | M1 | PLANNED |
| 3 | Integration & Optimization | Integrate utility into `geminiParser.js`, `emailCategorizer.js`, and `embeddingService.js` | M2 | PLANNED |
| 4 | Latency & Memory Verification | Measure pre-processing latency (target: 50% reduction), verify stability and E2E test suite compatibility | M3 | PLANNED |

## Code Layout
- `server/geminiParser.js` — Resume parsing logic using Ollama
- `server/emailCategorizer.js` — Email classification using Ollama
- `server/embeddingService.js` — Text embeddings using Ollama
- `server/ollamaOptimizer.js` — New optimization utility (compression & parameter mapping)
