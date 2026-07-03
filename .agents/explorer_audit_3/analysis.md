# Ollama Configuration, Optimization, and Deployment Audit

This analysis evaluates the current settings management for the Ollama integration in the TalentFlow platform, details optimization guidelines for local Ollama system services to prevent memory exhaustion and reduce latency, and drafts a comprehensive set of deployment guidelines for local setups.

---

## 1. Codebase Audit: Ollama Configuration & Management

The TalentFlow backend supports local or remote Ollama instances as an AI provider for resume parsing, embedding generation, and email categorization. 

### A. Database Model and Schema
In `server/models.js`, the `settingsSchema` defines how Ollama settings are stored in MongoDB (using a singleton document with ID `'global'`):
- **`ollamaUrl`** (String): The URL of the Ollama server. It defaults to `'https://istgenai.smartgeoapps.com/'` (a remote proxy/service).
- **`ollamaModel`** (String): The model used for generation tasks. It defaults to `'llama3'`.
- **`aiProvider`** (String): Toggled to `'ollama'` when using Ollama instead of Gemini, OpenAI, or Claude.

### B. API Routing and Settings Controls
In `server/server.js`, two main endpoints handle Ollama settings:
1. **GET `/api/settings`**: Retrieves global settings (with API keys/secrets masked for security).
2. **POST `/api/settings`**: Updates global settings.
   - Restricts updates to a list of allowed keys, including `ollamaUrl` and `ollamaModel`.
   - Admin access required (`authenticateToken`, `requireRole(['admin'])`).
3. **POST `/api/ollama/test-connection`**: Tests connectivity to the configured Ollama URL.
   - Extracts `ollamaUrl` from request body.
   - Executes a connection check by fetching `${ollamaUrl}/api/tags` using `fetchWithTimeout` with a **10-second timeout**.
   - If successful, returns the list of models currently loaded/installed in the Ollama instance (verifying that the endpoint is responsive and the Ollama server is functional).

### C. Services Integration & Configuration Options
Ollama is integrated into three backend modules with specific runtime parameters:

#### 1. Resume Text Parsing (`server/geminiParser.js`)
* **Endpoint**: Uses the Ollama Chat API (`${ollamaUrl}/api/chat`).
* **Format**: Forces JSON format output (`format: 'json'`) if a schema is provided.
* **Timeout**: Set to **15 minutes (900,000 ms)** via `fetchWithTimeout`. This extremely long timeout is vital to accommodate CPU-only inference or low-spec GPU setups that process long resumes.
* **LLM Request Options**:
  ```javascript
  options: {
    temperature: 0.1,
    num_ctx: 8192,
    num_predict: 2048
  }
  ```
  - **`num_ctx: 8192`**: Restricts context window to 8k tokens. This is sufficient for standard resumes but saves significant memory compared to 32k or 128k context windows.
  - **`num_predict: 2048`**: Limits response generation to 2048 tokens.
* **Truncation & Retry Logic**: If the JSON response is truncated (indicated by parsing errors such as `Unterminated` or `Unexpected end` of JSON input), the parser retries once with **`num_predict: 4096`**.

#### 2. Vector Embeddings (`server/embeddingService.js`)
* **Endpoint**: Uses the Ollama Embeddings API (`${ollamaUrl}/api/embed`).
* **Model**: Defaults to `'nomic-embed-text'` if `ollamaModel` is not specified or configured.
* **Batching**: Sends an array of texts (`texts`) in a single HTTP request payload.
* **Timeout**: Set to **3 minutes (180,000 ms)**.

#### 3. Email Sourcing & Categorization (`server/emailCategorizer.js`)
* **Endpoint**: Uses the Ollama Chat API (`${ollamaUrl}/api/chat`).
* **Format**: Forced JSON output (`format: 'json'`).
* **Timeout**: Set to **3 minutes (180,000 ms)**.
* **LLM Request Options**:
  ```javascript
  options: {
    temperature: 0.1,
    num_ctx: 2048,
    num_predict: 256
  }
  ```
  - Designed for low-latency classification tasks. Small context size (`2048`) and prediction size (`256`) minimize time-to-first-token (TTFT) and VRAM usage.

---

## 2. Ollama System Service Optimization Guidelines

Running Ollama locally on resource-constrained recruiter workstations or small office servers requires strict system-level and environment configurations. If unoptimized, simultaneous parsing requests or model switches can trigger Out-Of-Memory (OOM) killer events, system freezes, or extreme latency spike cascades.

### A. Core Environment Variables (Ollama System Configuration)
These environment variables must be injected into the Ollama system service process:

| Environment Variable | Recommended Value | Rationale |
|----------------------|-------------------|-----------|
| **`OLLAMA_NUM_PARALLEL`** | `1` (for low-spec/CPU) or `2` (for 12GB+ GPU) | Limits the number of requests executed concurrently. Setting this to `1` prevents multiple parallel resume uploads from exhausting VRAM and crashing the service. |
| **`OLLAMA_MAX_LOADED_MODELS`** | `1` (low VRAM) or `2` (medium-high VRAM) | Restricts how many models can reside in memory at once. If set to `1` on a system with 8GB RAM/VRAM, requesting an embedding (`nomic-embed-text`) followed by a resume parse (`llama3`) will cause continuous model swapping, adding 10-30s overhead per task. If system memory permits (e.g., 16GB+ RAM / 8GB+ VRAM), set to `2` to keep both models hot. |
| **`OLLAMA_KEEP_ALIVE`** | `60m` or `-1` | Keeps loaded models in memory for 60 minutes or indefinitely (`-1`). This eliminates the cold-start delay for subsequent candidates uploaded during a working session. |
| **`OLLAMA_FLASH_ATTENTION`** | `1` or `true` | Enables Flash Attention (on supported hardware). Reduces VRAM overhead by 15-30% and increases generation speeds. |
| **`OLLAMA_INTEL_GPU`** / **`OLLAMA_AMD_GPU`** | Set depending on hardware | Configures Ollama to utilize AMD (ROCm) or Intel (oneAPI) graphics cards if present instead of falling back to CPU-only. |

### B. Hardware Resource Constraints & Model Selection
Hardware capabilities dictate which models should be deployed:

1. **Low-End Workstations (CPU-only, 8GB - 16GB System RAM)**
   - **Recommended Models**:
     - Parsing: `llama3:8b-instruct-q4_K_M` (requires ~4.8GB RAM) or `phi3:3.8b-instruct-q4_K_M` (requires ~2.2GB RAM).
     - Embeddings: `nomic-embed-text` (requires ~280MB RAM).
   - **Constraints**: 
     - Restrict `num_ctx` to `4096` or `8192`.
     - Allocate CPU threads conservatively (see Threading below).
2. **Mid-Range Systems (GPU with 6GB - 8GB VRAM, 16GB+ System RAM)**
   - **Recommended Models**:
     - Parsing: `llama3:8b-instruct-q4_K_M` (fully offloaded to GPU).
     - Embeddings: `nomic-embed-text` (fully offloaded to GPU).
   - **VRAM Calculation**: Llama 3 8B Q4 (~4.8GB VRAM) + Nomic Embed (~280MB VRAM) + Context overhead (~500MB VRAM) = **~5.6GB VRAM**. Both models fit hot in VRAM on a 6GB/8GB card.
3. **High-End Systems (Dedicated GPU with 12GB+ VRAM, 32GB+ System RAM)**
   - **Recommended Models**:
     - Parsing: `llama3.1:8b-instruct-q8_0` (higher accuracy) or `mistral:7b-instruct-q4_K_M`.
     - Embeddings: `nomic-embed-text`.
   - **Optimization**: Set `OLLAMA_NUM_PARALLEL=2` and `OLLAMA_MAX_LOADED_MODELS=2`.

### C. CPU Thread Allocation & Threading Overrides
When GPU offloading is unavailable or only partial, Ollama defaults to using all available CPU threads. This can lock up the recruiter's workstation, causing the Node.js backend to drop connections or become unresponsive.
- **Thread Allocation Rule**: Allocate `N - 2` threads where `N` is the number of physical CPU cores (not logical threads) to leave headroom for OS operations, the Express server, and MongoDB.
- **Override Variables**: Set environment variables `OMP_NUM_THREADS` and `MKL_NUM_THREADS` within the Ollama daemon runner to explicitly limit core consumption.

---

## 3. Local Deployment Guidelines

Deploying Ollama alongside the TalentFlow stack locally can be optimized using system services.

### A. Linux Local Setup (Systemd Service Configuration)
On Linux systems (e.g., Ubuntu server or local workstation), configure the Ollama systemd service to run reliably:

1. **Install Ollama**:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
2. **Create Service Overrides**:
   Create a systemd override folder and file:
   ```bash
   sudo systemctl edit ollama.service
   ```
3. **Configure Resource Limits and Env Vars**:
   Paste the following config into the editor, customizing variables for the hardware:
   ```ini
   [Service]
   # Set environment variables for Ollama
   Environment="OLLAMA_HOST=0.0.0.0"
   Environment="OLLAMA_NUM_PARALLEL=1"
   Environment="OLLAMA_MAX_LOADED_MODELS=2"
   Environment="OLLAMA_KEEP_ALIVE=60m"
   Environment="OLLAMA_FLASH_ATTENTION=1"
   
   # CPU Threading constraints (e.g. for an 8-core CPU)
   Environment="OMP_NUM_THREADS=6"
   Environment="MKL_NUM_THREADS=6"
   
   # Prevent OOM-killer from targeting Ollama over system criticals
   OOMScoreAdjust=-500
   
   # Set system-level memory and resource limits
   LimitNOFILE=65535
   MemoryMax=14G
   MemoryHigh=12G
  ```
4. **Reload Daemon & Restart Ollama**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama.service
   ```

### B. Windows Local Setup (WSL2 & Desktop configuration)
On Windows workstations, Ollama runs natively or via WSL2. 

#### Native Windows Installer
1. Install Ollama using the official Windows installer.
2. To configure environment variables globally:
   - Search for **"Environment Variables"** in Windows search.
   - Under **System Variables**, add:
     - `OLLAMA_NUM_PARALLEL` = `1`
     - `OLLAMA_MAX_LOADED_MODELS` = `1` (if running on a standard laptop with < 8GB VRAM)
     - `OLLAMA_KEEP_ALIVE` = `60m`
3. Restart the Ollama application from the system tray.

#### WSL2 Engine Optimization (If using WSL2)
If Ollama is run inside a WSL2 Linux distribution, WSL2's default memory allocation behavior can trigger OOM errors because WSL2 dynamically claims and locks up to 50% of Windows host RAM.
1. Create or edit `C:\Users\<Your-Username>\.wslconfig` on the Windows host:
   ```ini
   [wsl2]
   memory=12GB # Set to ~75% of your total system memory
   processors=6 # Set to physical cores minus 2
   swap=4GB     # Provide swap space to absorb peak parsing spikes
   ```
2. Run `wsl --shutdown` in Windows Command Prompt to apply the configuration.

### C. Network and API Access Configuration
By default, Ollama binds to `127.0.0.1:11434`. To expose it to the local network or a remote TalentFlow Express server (e.g. running in Docker or on another machine):
1. **Host Binding**: Set `OLLAMA_HOST=0.0.0.0` in the service environment variables.
2. **CORS Configuration**: If the frontend directly calls the Ollama port (not recommended; call through the Express API instead), set `OLLAMA_ORIGINS="*"`.
3. **Firewall Setup (Linux UFW)**:
   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 11434 proto tcp comment 'Allow local TalentFlow server access'
   ```

### D. Verification Checklist for the Local Administrator
To verify that the local setup is optimized:
1. **Verify Loaded Models**: Run `ollama ps` to see which models are hot.
2. **Verify GPU Offloading**:
   - For NVIDIA: Run `nvidia-smi` and confirm `ollama` or `ollama_llama_server` processes are active on the GPU and consuming VRAM.
   - For AMD: Use `rocm-smi`.
3. **Monitor System Memory During Parsing**:
   - Upload a large candidate resume (e.g. a 5-page PDF).
   - Run `top` (Linux) or open Task Manager (Windows) to verify that memory usage remains stable (within configured bounds) and CPU consumption does not peg the machine at 100%.
