# TalentFlow Handover & Configuration Guide

**TalentFlow** is an enterprise-grade AI-powered recruitment automation platform. It automatically sources candidate resumes from email, extracts data from complex PDFs (both text-based and scanned images), parses them into structured profiles using LLMs, scores matches against open job descriptions, and organizes them in a kanban pipeline.

---

## 1. Core Technology Stack

The application is split into a **Frontend (Client)**, a **Backend (Server)**, a **Database Layer**, and a **Python OCR Subsystem**.

### Frontend (Client)
* **Framework**: React.js (Vite bundler) for a fast, modern reactive UI.
* **Styling**: Modern Vanilla CSS, implementing glassmorphism, glowing HUD elements, and custom scrollbars.
* **Icons**: `lucide-react` for premium vector iconography.
* **PDF Viewer**: Embedded HTML iframe utilizing native browser PDF renderers.

### Backend (Server)
* **Runtime**: Node.js (ES Modules, version 20+).
* **Framework**: Express.js for REST API endpoints.
* **Ingestion/Storage**: `multer` for secure PDF file uploads, stored in `/uploads`.
* **Automation**: Node-scheduler loops for automated email checks.

### AI Engine (Gemini)
* **Integration**: Native direct integration with the Google Gemini API (or via OpenRouter).
* **Model**: `gemini-1.5-flash` for high-speed, cost-effective structured resume parsing and match scoring.

### Database Layer
* **Database**: MongoDB (talentflow database).
* **ODM**: Mongoose for modeling Candidate, Job, Settings, and ProcessedEmail schemas.

### Python OCR Subsystem (Scanned PDF Fallback)
* **Language**: Python 3.
* **Libraries**:
  * `fitz` (PyMuPDF) to convert PDF pages into high-resolution images.
  * `opencv-python` (OpenCV) for image decoding and grayscale preprocessing.
  * `pytesseract` to bridge Python with the Tesseract-OCR binary.
* **Engine**: Tesseract-OCR (v5.4.0) for character recognition.

---

## 2. Core Workflows & Processes

### A. Automated Email Sourcing
1. A background timer runs every **30 seconds** on the backend.
2. It queries the configured Gmail inbox (via IMAP/Gmail API) for unread emails containing PDF attachments.
3. For each match, it downloads the PDF, saves it in `server/uploads`, and initiates text extraction.
4. Once processed, the email's unique `messageId` is stored in the `processedemails` collection. This prevents the poller from ever duplicate-processing or re-importing the same candidate, even if they are deleted from the pipeline.

### B. Smart PDF Text Extraction & OCR Fallback
1. **Upload/Sourcing**: PDF is uploaded via frontend or sourced via Gmail.
2. **Text Parsing**: Attempt to extract text using standard PDF parsing (`pdf-parse`).
3. **Scanned PDF Handling**: If text extraction returns empty or insufficient content, the Python OCR fallback is triggered.
4. **Image Conversion**: PyMuPDF (`fitz`) converts each PDF page into a high-res grayscale image.
5. **Character Recognition**: OpenCV preprocesses the images and Tesseract OCR extracts the raw text.
6. **AI Parsing**: The raw text (whether from standard parsing or OCR) is sent to Gemini to generate the structured JSON candidate profile.

### C. Split LinkedIn URL Reconstruction
* **Problem**: In two-column PDF resumes, horizontal OCR scanners read lines across columns, splitting contact info (e.g. reading `www.linkedin.com/in/jayav` on line 1, and the suffix `arapu-sri-charan-43273137b` further down the page), interspersed with other text.
* **Process**: The Gemini parser's prompt instructs the model to recognize split URLs and OCR spelling typos (like `wwwiinkedin` -> `linkedin`), merge the segments, and reconstruct a single, valid, clickable LinkedIn URL.

### D. Client-Side State Retention
* **Problem**: Normal conditional tab rendering unmounts inactive pages, resetting selections and search inputs when switching views.
* **Process**: All tab panels (`Dashboard`, `Inbox`, `PipelineBoard`, `TagSearch`, `Settings`) are kept mounted in the DOM. Switching tabs toggles their CSS `display` property (`block` vs `none`). This retains the state of loaded PDF previews, selected emails in the sourcing queue, search inputs, and job filters.

---

## 3. Deployment & Setup Guide

### Step 1: System Prerequisites
Ensure the following are installed on the deployment machine:
1. **Node.js** (v20 or higher)
2. **Python** (v3.10 or higher)
3. **MongoDB** (running locally on port `27017` or a cloud URI)
4. **Tesseract-OCR**:
   * **Windows**: Download and install [Tesseract-OCR](https://github.com/UB-Mannheim/tesseract/wiki).
   * **Mac**: `brew install tesseract`
   * **Linux**: `sudo apt-get install tesseract-ocr`
   * *Note: Ensure the binary path `C:\Program Files\Tesseract-OCR\tesseract.exe` exists or is added to the system PATH.*

### Step 2: Install Project Dependencies
Navigate to the root folder and run:

**For Backend (Server):**
```bash
cd server
npm install
pip install pymupdf opencv-python pytesseract requests
```

**For Frontend (Client):**
```bash
cd client
npm install
```

### Step 3: Configure Environment Variables
Create a file named `.env` in the `server` directory and paste the following:

```env
# Server Port
PORT=5000

# Gemini AI Integration
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
# If using OpenRouter, specify model (e.g., google/gemini-flash-1.5)
AI_MODEL=google/gemini-flash-1.5

# Database Config
MONGO_URI=mongodb://localhost:27017/talentflow

# Gmail Ingestion (IMAP Credentials)
# To source emails, create an "App Password" in your Google Account security settings
GMAIL_USER_EMAIL=your-recruiting-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Frontend URL (CORS authorization)
FRONTEND_URL=http://localhost:5173
```

### Step 4: Run the Application

1. **Start Backend Server:**
   ```bash
   cd server
   npm run dev
   ```
   *The console should print: `TalentFlow server running at http://localhost:5000` & `MongoDB Connected & Ready.`*

2. **Start Frontend Server:**
   ```bash
   cd client
   npm run dev
   ```
   *Vite will start the client at http://localhost:5173/.*
