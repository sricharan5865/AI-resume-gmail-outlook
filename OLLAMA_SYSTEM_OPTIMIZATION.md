# Ollama System Optimization Guidelines

This guide details the system configurations, audit steps, and tuning recommendations to optimize Ollama for production-grade, low-latency execution and high reliability.

## 1. CPU Thread Allocation
To prevent thread thrashing and maximize performance when running on CPUs (or hybrid setups):
- **Rule of thumb**: Allocate physical cores minus 2 (`N - 2`), where `N` is the number of physical CPU cores.
- **Why**: Reserving 2 physical cores ensures the OS, model orchestrators, and database services remain responsive without competing with compute-heavy Ollama operations.
- **Setting**: This can be specified inside Ollama using specific runner parameters or system configurations depending on the platform/wrapper.

## 2. Resource Management Variables
Set the following environment variables to control Ollama's loading and execution policies:

- `OLLAMA_NUM_PARALLEL=1`
  - **Description**: Restricts the number of parallel requests handled simultaneously by a single model instance.
  - **Rationale**: Setting this to 1 ensures that resources (GPU VRAM or CPU RAM) are dedicated to processing a single task at maximum speed, avoiding execution concurrency slowdowns in memory-constrained local setups.
  
- `OLLAMA_MAX_LOADED_MODELS=2`
  - **Description**: Restricts the maximum number of models loaded in memory simultaneously.
  - **Rationale**: Allows hosting both an LLM (e.g., Llama 3) and an embedding model (e.g., nomic-embed-text) in memory without continuous unloading/reloading, while preventing VRAM overflow.

- `OLLAMA_KEEP_ALIVE=60m`
  - **Description**: Keeps models loaded in memory for 60 minutes after the last request.
  - **Rationale**: Reduces startup latency for subsequent tasks since the model remains hot in memory rather than being garbage-collected/unloaded after the default 5 minutes.

## 3. systemd Configuration Template (Linux)
For Linux deployments, configure the system service unit files to ensure the environment variables are correctly exported and limits are properly tuned.

Create or edit `/etc/systemd/system/ollama.service.d/override.conf`:

```ini
[Service]
# Environment variables for resource optimization
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_KEEP_ALIVE=60m"

# Performance and resource limits
LimitNOFILE=65535
LimitNPROC=65535
```

Apply changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

## 4. WSL2 Configuration (`.wslconfig`)
When running Ollama inside a Windows Subsystem for Linux 2 (WSL2) container, memory and CPU allocation can bottleneck execution if not configured correctly. Create or edit `%USERPROFILE%\.wslconfig` in Windows:

```ini
[wsl2]
# Limit memory allocation to 70-80% of total system RAM
memory=16GB

# Limit processors allocation to physical CPU cores
processors=8

# Enable nested virtualization and page reporting
nestedVirtualization=true
pageReporting=true
```

Ensure WSL is restarted after modifying this file:
```cmd
wsl --shutdown
```
