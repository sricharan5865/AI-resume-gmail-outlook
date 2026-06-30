import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts raw text from any supported file type (PDF, DOCX, TXT, RTF, Images, etc.)
 * @param {string} filePath - Absolute path to the file
 * @param {string} originalName - Original uploaded filename
 * @param {string} mimeType - The mimetype of the file
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromFile(filePath, originalName, mimeType) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  
  // 1. Plain text / markdown / csv / json / rtf files
  if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json' || ext === '.rtf') {
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (err) {
      console.warn(`Failed to read plain text file: ${originalName || filePath}`, err.message);
    }
  }

  // 2. DOCX documents
  if (ext === '.docx') {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      if (result && result.value && result.value.trim().length > 0) {
        return result.value;
      }
    } catch (err) {
      console.warn(`Mammoth failed to extract DOCX: ${originalName || filePath}`, err.message);
    }
  }

  // 3. Images (PNG, JPG, JPEG, BMP, TIFF, GIF)
  if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif'].includes(ext)) {
    try {
      const text = await runPythonOCRDirect(filePath);
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (err) {
      console.warn(`Direct image OCR failed: ${originalName || filePath}`, err.message);
    }
  }

  // 4. PDF (use existing extractTextFromPDF logic but reading from filePath)
  if (ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const text = await extractTextFromPDF(buffer);
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (err) {
      console.warn(`Failed to parse as PDF: ${originalName || filePath}`, err.message);
    }
  }

  // 5. Fallback: try reading as plain UTF-8 text anyway
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    if (text && text.trim().length > 0 && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text.substring(0, 100))) {
      return text;
    }
  } catch (err) {}

  // Last resort: try python OCR on the file path directly
  try {
    const text = await runPythonOCRDirect(filePath);
    if (text && text.trim().length > 0) {
      return text;
    }
  } catch (err) {}

  throw new Error(`Unsupported or unreadable file format: ${originalName || filePath}`);
}

/**
 * Extracts raw text from a PDF Buffer.
 * @param {Buffer} buffer - PDF binary data
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPDF(buffer) {
  let text = '';
  try {
    const data = await pdf(buffer);
    text = data.text || '';
  } catch (error) {
    console.warn('pdf-parse failed, falling back to OCR...', error.message);
  }

  if (!text || text.trim().length === 0) {
    console.log('No text extracted, attempting Python OCR fallback...');
    text = await runPythonOCR(buffer);
  }
  
  if (!text || text.trim().length === 0) {
      throw new Error('Failed to parse PDF file contents or run OCR.');
  }
  return text;
}

function runPythonOCR(buffer) {
  return new Promise((resolve, reject) => {
    const tempPdfPath = path.join(os.tmpdir(), `temp_ocr_${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);

    const scriptPath = path.join(__dirname, 'ocr_fallback.py');
    const pythonProcess = spawn('python', [scriptPath, tempPdfPath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      try { fs.unlinkSync(tempPdfPath); } catch (e) {}
      if (code !== 0) {
        console.error(`Python OCR exited with code ${code}: ${errorOutput}`);
        reject(new Error('Python OCR failed.'));
      } else {
        resolve(output);
      }
    });
  });
}

function runPythonOCRDirect(filePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'ocr_fallback.py');
    const pythonProcess = spawn('python', [scriptPath, filePath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python OCR Direct exited with code ${code}: ${errorOutput}`);
        reject(new Error('Python OCR failed.'));
      } else {
        resolve(output);
      }
    });
  });
}
