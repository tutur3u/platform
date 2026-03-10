import modal

# Persist downloaded OCR model artifacts across container restarts.
paddlex_cache_volume = modal.Volume.from_name(
    "ocr-paddlex-cache",
    create_if_missing=True,
)
hf_cache_volume = modal.Volume.from_name(
    "ocr-hf-cache",
    create_if_missing=True,
)

# Define base image and system dependencies
image = (
    modal.Image.debian_slim(python_version="3.12")
    # Install system dependencies
    .apt_install(["libgl1-mesa-glx", "libglib2.0-0"])
    # Install Python packages
    .pip_install_from_pyproject("pyproject.toml")
    # Add local source code
    .add_local_python_source("extraction", "parser")
)
app = modal.App("ocr-service", image=image)


@app.function(
    cpu=2,
    memory=2048,
    min_containers=1,
    volumes={
        "/root/.paddlex": paddlex_cache_volume,
        "/root/.cache/huggingface": hf_cache_volume,
    },
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    import asyncio
    import base64
    import os

    import cv2
    import numpy as np
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from paddleocr import PaddleOCR  # type: ignore

    from extraction import extract_info
    from parser import parse_result

    os.environ["OMP_NUM_THREADS"] = "1"

    # Initialize PaddleOCR
    ocr = PaddleOCR(
        device="cpu",
        use_doc_orientation_classify=False,  # Disables document orientation classification model via this parameter
        use_doc_unwarping=False,  # Disables text image rectification model via this parameter
        use_textline_orientation=False,  # Disables text line orientation classification model via this parameter
    )

    # Initialize FastAPI app
    fast_api = FastAPI()

    # Allow CORS for all origins (you can restrict this in production)
    fast_api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @fast_api.post("/capture")
    async def capture(request: Request):
        """
        Endpoint to capture an image, process it, and extract ID information.
        """
        body = await request.json()

        try:
            # Validate image_data
            if not body.get("image_data"):
                raise HTTPException(status_code=400, detail="No image data provided")

            # Check if image_data has the data URL prefix
            if "," not in body.get("image_data"):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid image data format - missing data URL prefix",
                )

            # Decode the base64 image
            image_data = body.get("image_data").split(",")[1]
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

    return fast_api
