import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromPDF } from './parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    const file = path.join(__dirname, 'uploads', '1779596031129-JAYAVARAPU_SRICHARAN_CV.pdf');
    const buffer = fs.readFileSync(file);
    const text = await extractTextFromPDF(buffer);
    console.log('Extracted text length:', text.trim().length);
    console.log('Text snippet:', text.trim().substring(0, 100));
  } catch (err) {
    console.error(err);
  }
}
run();
