import asyncio
import base64
import cv2
import numpy as np
import os
import re

os.environ["OMP_NUM_THREADS"] = "1"

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from paddleocr import PaddleOCR

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang='en')

def preprocess_frame(frame):
    """
    Preprocess the image for better OCR results.
    - Converts the image to grayscale.
    - Applies Gaussian blur to reduce noise.
    - Applies adaptive thresholding for better text clarity.
    """
    # Convert to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # Apply adaptive thresholding
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    return thresh

async def process_frame(frame):
    """
    Processes the image and extracts text using Tesseract OCR.
    """
    # PaddleOCR returns a list of tuples: (bbox, (text, confidence))
    result = await asyncio.to_thread(ocr.ocr, frame, cls=True)
    # Concatenate all detected text
    extracted_text = '\n'.join([line[1][0] for line in result[0]]) if result[0] else ''
    return extracted_text

def extract_info(text):
    """
    Extracts name and student number from the extracted text.
    Updated to remove specified keywords and months before processing.
    Handles names split across lines and formats uppercase names correctly.
    """
    # Define the excluded keywords, including months of the year
    excluded_keywords = r"(RMIT|Student|STUDENT|UNIVERSITY|SINH\sVIEN|January|February|March|April|May|June|July|August|September|October|November|December)"

    # Remove excluded keywords from the text
    cleaned_text = re.sub(excluded_keywords, '', text, flags=re.IGNORECASE)

    # Pattern to match full names (first and last) allowing for newlines or spaces between parts, followed by a student number.
    combined_pattern = r"([A-Z][a-zA-Z]+(?:[\s\n]+[A-Z][a-zA-Z]+)*)\s*\n*\s*(\d{7})"
    match = re.search(combined_pattern, cleaned_text)

    if match:
        name, student_number = match.groups()
        
        # Split the name into parts and format
        name_parts = name.split()
        formatted_name_parts = [
            part.capitalize() if part.isupper() else part for part in name_parts
        ]
        formatted_name = ' '.join(formatted_name_parts)
        
        return formatted_name.strip(), student_number.strip()
    
    return None

class Request(BaseModel):
    imageData: str

@app.post('/capture')
async def capture(request: Request):
    """
    Endpoint to capture an image, process it, and extract ID information.
    """
    try: 
        # Decode the base64 image
        image_data = request.imageData.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(image_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
     
        if frame is None:
            raise HTTPException(status_code=400, detail="Image could not be decoded")

        # Process the frame and extract text
        extracted_text = await process_frame(frame)
        info = extract_info(extracted_text)

        if info:
            name, student_number = info
            return {"name": name, "studentNumber": student_number}
        else:
            raise HTTPException(status_code=400, detail="No match found in the provided ID data")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
def create_app():
    return app