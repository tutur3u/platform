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
ocr = PaddleOCR(use_angle_cls=True, lang="en")

# Development logging flag - set to True to enable debug logs
DEBUG_LOG = False


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
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    return thresh


async def process_frame(frame):
    """
    Processes the image and extracts text using PaddleOCR.
    """
    result = None
    try:
        # PaddleOCR returns a list of tuples: (bbox, (text, confidence))
        result = await asyncio.to_thread(ocr.ocr, frame)
        if DEBUG_LOG:
            print(f"Raw OCR result type: {type(result)}")
            print(f"Result length: {len(result) if result else 0}")

        if not result:
            if DEBUG_LOG:
                print("No text detected by OCR")
            return ""

        # Handle the new PaddleOCR format
        if isinstance(result, list) and len(result) > 0:
            first_result = result[0]
            if DEBUG_LOG:
                print(f"First result type: {type(first_result)}")
                print(
                    f"First result keys (if dict): {list(first_result.keys()) if isinstance(first_result, dict) else 'Not a dict'}"
                )

            # Check if it's the new format with rec_texts and rec_scores
            if (
                isinstance(first_result, dict)
                and "rec_texts" in first_result
                and "rec_scores" in first_result
            ):
                if DEBUG_LOG:
                    print("Using new PaddleOCR format")
                try:
                    rec_texts = first_result["rec_texts"]
                    rec_scores = first_result["rec_scores"]

                    if DEBUG_LOG:
                        print(
                            f"rec_texts type: {type(rec_texts)}, length: {len(rec_texts) if rec_texts else 0}"
                        )
                        print(
                            f"rec_scores type: {type(rec_scores)}, length: {len(rec_scores) if rec_scores else 0}"
                        )

                    # Extract text with confidence scores for debugging
                    text_with_confidence = []
                    if rec_texts and rec_scores:
                        for i, (text, confidence) in enumerate(
                            zip(rec_texts, rec_scores)
                        ):
                            if DEBUG_LOG:
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
                    if DEBUG_LOG:
                        print(f"Error in new format processing: {new_format_error}")
                    raise

            # Handle the old format
            elif isinstance(first_result, list):
                if DEBUG_LOG:
                    print("Using old PaddleOCR format")
                try:
                    text_with_confidence = []
                    for i, line in enumerate(first_result):
                        if DEBUG_LOG:
                            print(
                                f"Processing line {i}: {type(line)}, length: {len(line) if hasattr(line, '__len__') else 'No length'}"
                            )

                        if len(line) >= 2:
                            bbox, text_info = line
                            if isinstance(text_info, tuple) and len(text_info) >= 2:
                                text, confidence = text_info
                                if DEBUG_LOG:
                                    print(
                                        f"Detected: '{text}' (confidence: {confidence:.2f})"
                                    )
                                # Only include text with reasonable confidence
                                if confidence > 0.5:
                                    text_with_confidence.append(text)
                except Exception as old_format_error:
                    if DEBUG_LOG:
                        print(f"Error in old format processing: {old_format_error}")
                    raise

                # Concatenate all detected text
                extracted_text = "\n".join(text_with_confidence)
                return extracted_text

        if DEBUG_LOG:
            print("No text detected by OCR")
        return ""
    except Exception as e:
        if DEBUG_LOG:
            print(f"Error in process_frame: {str(e)}")
            print(f"Error type: {type(e)}")
            print(f"Result structure: {result}")
        raise


def extract_info(text):
    """
    Extracts name and student number from the extracted text.
    Updated to remove specified keywords and months before processing.
    Handles names split across lines and formats uppercase names correctly.
    """
    if DEBUG_LOG:
        print(f"Processing text for extraction: '{text}'")

    # Define the excluded keywords, including months of the year
    excluded_keywords = r"(RMIT|Student|STUDENT|UNIVERSITY|SINH\sVIEN|January|February|March|April|May|June|July|August|September|October|November|December)"

    # Remove excluded keywords from the text
    cleaned_text = re.sub(excluded_keywords, "", text, flags=re.IGNORECASE)
    if DEBUG_LOG:
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
            if DEBUG_LOG:
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
                if DEBUG_LOG:
                    print(
                        f"Successfully extracted: name='{formatted_name}', student_number='{student_number}'"
                    )
                return formatted_name.strip(), student_number.strip()

    if DEBUG_LOG:
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
        if DEBUG_LOG:
            print(f"Base64 data length: {len(image_data)}")

        nparr = np.frombuffer(base64.b64decode(image_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Image could not be decoded")

        if DEBUG_LOG:
            print(f"Frame shape: {frame.shape}")

        # Process the frame and extract text
        extracted_text = await process_frame(frame)

        if DEBUG_LOG:
            print(f"Extracted text: {extracted_text}")

        info = extract_info(extracted_text)
        if DEBUG_LOG:
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
