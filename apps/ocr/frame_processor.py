import asyncio


async def process_frame(ocr, frame):
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
