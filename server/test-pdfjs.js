import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

async function run() {
  const data = new Uint8Array(fs.readFileSync("C:\\Users\\sri charan\\Desktop\\klh\\Sem 1-2\\CSE\\JAYAVARAPU SRICHARAN CV.pdf"));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n';
  }
  console.log("Extracted length:", text.length);
  console.log(text.substring(0, 500));
}
run();
