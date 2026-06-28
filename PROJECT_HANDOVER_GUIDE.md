# TalentFlow Handover & Configuration Guide

**TalentFlow** is an enterprise-grade AI-powered recruitment automation platform. It automatically sources candidate resumes from email, extracts data from complex PDFs (both text-based and scanned images), parses them into structured profiles using LLMs, scores matches against open job descriptions, and organizes them in a kanban pipeline.

---

## 1. Core Technology Stack

The application is split into a **Frontend (Client)**, a **Backend (Server)**, a **Database Layer**, and a **Python OCR Subsystem**.

### Frontend (Client)
* **React.js**: JavaScript framework used to build the responsive and interactive single-page application (SPA) UI.
* **Vite**: Modern build tool and development server for fast bundling, compilation, and hot module replacement.
* **Vanilla CSS**: Used for all custom styling, implementing glassmorphism layouts, glowing HUD elements, and customized scrollbars.
* **Lucide React**: Vector icon library used for modern and consistent HUD icon styles.
* **DOM Tab State Retention**: Single-page setup with tabs kept mounted in the DOM to prevent input and PDF preview state resets when navigating views.

### Backend (Server)
* **Node.js (v20+)**: JavaScript runtime environment.
* **Express.js**: Backend framework hosting the REST APIs for candidate retrieval, tag search, email synchronization, and settings management.
* **Multer**: Middleware used for handling multipart/form-data (secure candidate resume file uploads).
* **Node-Scheduler**: Automated cron-like runner that schedules the background Gmail/Outlook sourcing loop.

### AI Engine (Gemini AI)
* **Gemini AI API**: Acts as the language model gateway.
* **`google/gemini-2.5-flash`**: The specific LLM endpoint utilized to convert unstructured resume texts into formatted JSON profiles, score candidates, and assign recruiting tags.

### Database Layer
* **MongoDB & MongoDB Atlas**: NoSQL database used to store candidates, jobs, configuration settings, and processed email metadata.
* **Mongoose**: Object Data Modeling (ODM) library used to structure the schemas and handle database queries.

### Python OCR Subsystem (Scanned PDF Fallback)
* **Python 3**: Runtime engine for OCR tasks when scanned PDFs are detected.
* **PyMuPDF (`fitz`)**: Python module used to render PDF pages into images.
* **OpenCV (`opencv-python`)**: Preprocesses the rendered page images (like converting to grayscale) for improved text visibility.
* **Tesseract-OCR & PyTesseract**: OCR engine used to read character shapes from images/scanned PDFs and translate them back into editable text.

---

## 2. Production Deployments & Configurations (Render + MongoDB Atlas)

### A. MongoDB Atlas Cloud Database
* **Database Cluster**: `Cluster0`
* **DB User**: `sricharanjayavarapu_db_user`
* **Network Access**: Whitelisted to `0.0.0.0/0` to allow Render servers to connect securely.

### B. Backend Web Service (Render)
* **URL**: `https://ai-resume-gmail-outlook.onrender.com`
* **Environment Variables**:
  * `MONGO_URI`: `mongodb+srv://sricharanjayavarapu_db_user:<password>@cluster0.p7dzk.mongodb.net/talentflow?retryWrites=true&w=majority`
  * `PORT`: `5000`
  * `GEMINI_API_KEY`: *(Your Gemini AI API key)*
  * `AI_MODEL`: `google/gemini-2.5-flash` *(Overrides default fallback)*
  * `FRONTEND_URL`: `https://ai-resume-gmail-outlook-1.onrender.com` *(CORS authorization)*
  * `GMAIL_USER_EMAIL`: *(recruiter email for sourcing)*
  * `GMAIL_APP_PASSWORD`: *(16-character Google App Password)*

### C. Frontend Static Site (Render)
* **URL**: `https://ai-resume-gmail-outlook-1.onrender.com`
* **Environment Variables**:
  * `VITE_BACKEND_URL`: `https://ai-resume-gmail-outlook.onrender.com` *(Tells the client where the backend resides. Set at build-time)*
* **Build Settings**:
  * Build Command: `npm run build`
  * Publish Directory: `dist` (or `client/dist` depending on repository layout)

---

## 3. Important Bug Fixes & Optimizations

### A. AI Model Endpoint Error
* **Problem**: The backend defaulted to requesting `google/gemini-flash-1.5`, which is no longer a valid model ID.
* **Fix**: Updated all fallbacks in `geminiParser.js` and `emailCategorizer.js` to `google/gemini-2.5-flash`.

### B. API Credit & Token Budget Error
* **Problem**: Free tier API keys restrict the maximum possible token request size. Since the backend didn't specify `max_tokens`, the API defaulted it to the model's absolute maximum of **65,535 tokens**, causing requests to fail with a credit/budget check.
* **Fix**: Added explicit token limits to the API calls:
  * Resume Parsing: `max_tokens: 2000`
  * Email Categorization: `max_tokens: 1000`
  This restricts the potential cost per call, allowing them to fit cleanly within the free tier credit limits.

### C. UI Score Reset & "0" Scores
* **Problem**: General candidates (without matched jobs) showed `0` for scores in the **Advanced Tag Search** page because it was hardcoded to show `matchScore`.
* **Fix**: Updated `TagSearch.jsx` to respect the global `rankAccordingToJob` toggle, matching the Dashboard and Pipeline Board by falling back to showing `ownCategoryScore` (the candidate's standalone competency score) when job matching is not selected.

---

## 4. Run Locally (Development Setup)

1. **Start Backend Server:**
   ```bash
   cd server
   npm run dev
   ```
2. **Start Frontend Server:**
   ```bash
   cd client
   npm run dev
   ```
   *The local frontend will start at http://localhost:5173/ and automatically connect to your local backend (port 5000) or your production backend depending on `.env` configuration.*

