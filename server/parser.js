import pdf from 'pdf-parse';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
