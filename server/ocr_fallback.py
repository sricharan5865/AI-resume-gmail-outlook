import sys
import os
import cv2
import numpy as np
import pytesseract
import fitz  # PyMuPDF

# Windows default tesseract path from winget
TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

def process_image(image_bytes):
    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return ""
        
    # Standard document OCR is best done on the entire page image.
    # Convert to grayscale for better Tesseract performance
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Run Tesseract on the full grayscale image
    text = pytesseract.image_to_string(gray, config='--oem 1 --psm 3')
    return text

def main():
    if len(sys.argv) < 2:
        print("Usage: python ocr_fallback.py <pdf_path>", file=sys.stderr)
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"Error: File not found {pdf_path}", file=sys.stderr)
        sys.exit(1)

    try:
        # Extract images from PDF using PyMuPDF
        doc = fitz.open(pdf_path)
        full_text = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # Scale up for better OCR
            img_bytes = pix.tobytes("png")
            page_text = process_image(img_bytes)
            full_text.append(page_text)
            
        print("\n".join(full_text))
        sys.exit(0)
    except Exception as e:
        print(f"Python OCR Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
