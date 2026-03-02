import asyncio
import base64
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCRVL  # type: ignore
from pydantic import BaseModel

from extraction import extract_info
from parser import parse_result

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
        result = await asyncio.to_thread(ocr.predict, frame)
        extracted_text = parse_result(result)

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
