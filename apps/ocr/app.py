import asyncio
import base64
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCRVL
from pydantic import BaseModel

from extraction import extract_info

os.environ["OMP_NUM_THREADS"] = "1"

# Initialize PaddleOCRVL
ocr = PaddleOCRVL(device="cpu")

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
                    for i, (text, confidence) in enumerate(
                        zip(rec_texts, rec_scores, strict=False)
                    ):
                        print(f"Processing item {i}: '{text}' (confidence: {confidence:.2f})")

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


class Request(BaseModel):
    image_data: str


@app.post("/capture")
async def capture(request: Request):
    """
    Endpoint to capture an image, process it, and extract ID information.
    """
    try:
        # Validate image_data
        if not request.image_data:
            raise HTTPException(status_code=400, detail="No image data provided")

        # Check if image_data has the data URL prefix
        if "," not in request.image_data:
            raise HTTPException(
                status_code=400,
                detail="Invalid image data format - missing data URL prefix",
            )

        # Decode the base64 image
        image_data = request.image_data.split(",")[1]
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

        return {
            "error": "No match found in the provided ID data",
            "extracted_text": extracted_text,
            "debug": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}") from e
