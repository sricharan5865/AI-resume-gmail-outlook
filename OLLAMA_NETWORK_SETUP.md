# Ollama Local Network Connection Guide (Old Laptop: Linux)

This guide explains how to run **Ollama** on your **Linux old laptop** and connect to it from the **new laptop** where the recruitment automation project runs.

---

## 📋 Prerequisites
* Both laptops must be connected to the **same Wi-Fi router / local network**.

---

## 🛠️ Step 1: Configure Ollama on the Linux Old Laptop (Allow network connections)

By default, Ollama only listens on `127.0.0.1` (localhost), which blocks other devices from connecting. We need to set the `OLLAMA_HOST` environment variable to `0.0.0.0` so it listens on all network interfaces.

### Method A: If Ollama is running as a systemd service (Recommended & Default)
1. Open the systemd configuration editor for the Ollama service:
   ```bash
   sudo systemctl edit ollama.service
   ```
2. This opens a text editor. Add the following lines between the top comments:
   ```ini
   [Service]
   Environment="OLLAMA_HOST=0.0.0.0"
   ```
3. Save and close the editor (if using `nano`, press `Ctrl+O`, then `Enter`, then `Ctrl+X`).
4. Reload systemd daemon to apply the change:
   ```bash
   sudo systemctl daemon-reload
   ```
5. Restart the Ollama service:
   ```bash
   sudo systemctl restart ollama
   ```

### Method B: If you run Ollama manually in the Terminal
If you start Ollama manually by typing commands, run it with the environment variable prefixed:
```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

---

## 🔒 Step 2: Open Port 11434 on the Linux Firewall

To allow the new laptop to connect, your Linux firewall must allow incoming traffic on port **11434**.

### If your Linux distribution uses UFW (Ubuntu, Debian, Mint):
Run the following command:
```bash
sudo ufw allow 11434/tcp
```

### If your Linux distribution uses firewalld (Fedora, CentOS, RHEL):
Run the following commands:
```bash
sudo firewall-cmd --add-port=11434/tcp --permanent
sudo firewall-cmd --reload
```

---

## 🔍 Step 3: Find the Linux Laptop's Local IP Address

You need the local IP address of your Linux laptop to connect to it. Run this command in your Linux terminal:
```bash
hostname -I
```
This will print one or more IP addresses (e.g., `192.168.1.15`). Note the one that corresponds to your local network connection.

---

## 🌐 Step 4: Verify Connection from the New Laptop

To ensure everything is configured properly before updating settings in the project:
1. Go to your **new laptop**.
2. Open a web browser.
3. Enter your Linux laptop's IP and port 11434 in the address bar:
   ```text
   http://<LINUX_LAPTOP_IP>:11434
   ```
   *(For example: `http://192.168.1.15:11434`)*
4. If it works, you should see the message:
   > **"Ollama is running"**

---

## ⚙️ Step 5: Update the Project Settings on the New Laptop

Now configure the app to send AI parsing requests to your old Linux laptop:

1. Open your recruitment project web application on the **new laptop**.
2. Go to the **Settings** panel.
3. Scroll to the **AI Provider** configuration.
4. Select **Ollama** as the provider.
5. In the **Ollama API URL** field, replace `http://localhost:11434` with:
   ```text
   http://<LINUX_LAPTOP_IP>:11434
   ```
   *(For example: `http://192.168.1.15:11434`)*
6. In the **Ollama Model** field, input the exact name of the model downloaded on your Linux laptop (e.g., `llama3` or `mistral`).
   * *Note: To download a model on the Linux laptop, run `ollama run llama3` in its terminal.*
7. Click **Save Settings**.

Your recruitment system is now configured to offload AI parsing to Ollama running on your old Linux laptop! 🎉
