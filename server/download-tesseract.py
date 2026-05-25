import urllib.request
import os

url = "https://github.com/UB-Mannheim/tesseract/releases/download/v5.3.3.20231005/tesseract-ocr-w64-setup-5.3.3.20231005.exe"
print("Downloading Tesseract installer...")
urllib.request.urlretrieve(url, "tesseract-setup.exe")
print("Download complete.")
