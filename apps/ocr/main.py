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
ocr = PaddleOCR(
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)


async def process_frame(frame):
    """
    Processes the image and extracts text using PaddleOCR.
    """
    result = None
    try:
        result = await asyncio.to_thread(ocr.predict, frame)

        if not result:
            print("No text detected by OCR")
            return ""

        print(f"Raw OCR result type: {type(result)}")
        print(f"Result length: {len(result)}")

        if len(result) > 0:
            first_result = result[0]

            try:
                rec_texts = first_result["rec_texts"]
                rec_scores = first_result["rec_scores"]

                print(f"rec_texts type: {type(rec_texts)}, length: {len(rec_texts)}")
                print(f"rec_scores type: {type(rec_scores)}, length: {len(rec_scores)}")

                # Extract text with confidence scores for debugging
                text_with_confidence = []
                if rec_texts and rec_scores:
                    for i, (text, confidence) in enumerate(zip(rec_texts, rec_scores)):
                        print(
                            f"Processing item {i}: '{text}' (confidence: {confidence:.2f})"
                        )

                        # Only include text with reasonable confidence
                        if confidence > 0.5:
                            text_with_confidence.append(text)

                # Concatenate all detected text
                extracted_text = " ".join(text_with_confidence)
                return extracted_text

            except Exception as new_format_error:
                print(f"Error in new format processing: {new_format_error}")
                raise

        print("No text detected by OCR")
        return ""
    except Exception as e:
        print(f"Error in process_frame: {e}")
        print(f"Result structure: {result}")
        raise


def extract_info(text):
    """
    Extracts name and student number from the extracted text.
    Updated to remove specified keywords and months before processing.
    Handles names split across lines and formats uppercase names correctly.
    """
    print(f"Processing text for extraction: '{text}'")

    # Define the excluded keywords, including months of the year
    excluded_keywords = r"(RMIT|Student|STUDENT|UNIVERSITY|SINH\sVIEN|January|February|March|April|May|June|July|August|September|October|November|December)"

    # Remove excluded keywords from the text
    cleaned_text = re.sub(excluded_keywords, "", text, flags=re.IGNORECASE)
    print(f"Cleaned text: '{cleaned_text}'")

    # Try multiple patterns for more flexibility
    patterns = [
        # Original pattern
        r"([A-Z][a-zA-Z]+(?:[\s\n]+[A-Z][a-zA-Z]+)*)\s*\n*\s*(\d{7})",
        # More flexible pattern for names and student numbers
        r"([A-Za-z]+(?:[\s\n]+[A-Za-z]+)+).*?(\d{7})",
        # Even more flexible - any sequence of letters followed by 7 digits
        r"([A-Za-z\s]+).*?(\d{7})",
        # Look for 7 digits anywhere and try to find name before it
        r"([A-Za-z]+(?:\s+[A-Za-z]+)+).*?(\d{7})",
    ]

    for i, pattern in enumerate(patterns):
        match = re.search(pattern, cleaned_text, re.MULTILINE | re.DOTALL)
        if match:
            print(f"Pattern {i+1} matched: {match.groups()}")
            name, student_number = match.groups()

            # Clean and format the name
            name = re.sub(
                r"\s+", " ", name.strip()
            )  # Replace multiple spaces with single space
            name_parts = name.split()
            formatted_name_parts = [
                part.capitalize() if part.isupper() or part.islower() else part
                for part in name_parts
                if len(part) > 1  # Filter out single characters
            ]

            if formatted_name_parts and len(student_number) == 7:
                formatted_name = " ".join(formatted_name_parts)
                print(
                    f"Successfully extracted: name='{formatted_name}', student_number='{student_number}'"
                )
                return formatted_name.strip(), student_number.strip()

    print("No patterns matched")
    return None


class Request(BaseModel):
    imageData: str


@app.post("/capture")
async def capture(request: Request):
    """
    Endpoint to capture an image, process it, and extract ID information.
    """
    try:

        # Validate imageData
        if not request.imageData:
            raise HTTPException(status_code=400, detail="No image data provided")

        # Check if imageData has the data URL prefix
        if "," not in request.imageData:
            raise HTTPException(
                status_code=400,
                detail="Invalid image data format - missing data URL prefix",
            )

        # Decode the base64 image
        image_data = request.imageData.split(",")[1]
        print(f"Base64 data length: {len(image_data)}")

        nparr = np.frombuffer(base64.b64decode(image_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Image could not be decoded")

        print(f"Frame shape: {frame.shape}")

        # Process the frame and extract text
        extracted_text = await process_frame(frame)

        print(f"Extracted text: {extracted_text}")

        info = extract_info(extracted_text)
        print(f"Extracted info: {info}")

        if info:
            name, student_number = info
            return {"name": name, "studentNumber": student_number}
        else:
            return {
                "error": "No match found in the provided ID data",
                "extracted_text": extracted_text,
                "debug": True,
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
