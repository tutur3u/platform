import logging

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from markitdown_service import handle_markitdown

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Local MarkItDown Service")


class MarkitdownRequest(BaseModel):
    signed_url: str
    filename: str | None = None
    enable_plugins: bool = True


@app.post("/markitdown")
async def markitdown_endpoint(payload: MarkitdownRequest):
    """Convert a Supabase signed file URL into markdown using MarkItDown."""
    try:
        return await handle_markitdown(
            payload.signed_url.strip(),
            payload.filename,
            payload.enable_plugins,
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("markitdown conversion failed")
        raise HTTPException(status_code=500, detail="Failed to convert file") from error


if __name__ == "__main__":
    print("🚀 Starting local MarkItDown service on http://localhost:8000")
    uvicorn.run("local_server:app", host="127.0.0.1", port=8000, reload=True)
