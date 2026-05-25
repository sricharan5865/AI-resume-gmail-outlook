import fs from 'fs';
import PDFParser from 'pdf2json';

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    const text = pdfParser.getRawTextContent();
    console.log("pdf2json Extracted text length:", text.length);
    console.log(text.substring(0, 500));
    process.exit(0);
});

pdfParser.loadPDF("C:\\Users\\sri charan\\Desktop\\klh\\Sem 1-2\\CSE\\JAYAVARAPU SRICHARAN CV.pdf");
