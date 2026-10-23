"""Utilities for handling MarkItDown file conversion requests."""

import asyncio
import logging
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import aiohttp
import requests
from fastapi import HTTPException
from markitdown import MarkItDown
from yarl import URL

MAX_MARKITDOWN_BYTES = 50 * 1024 * 1024
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
}
SUPPORTED_SUFFIXES = frozenset(
    {
        ".bin",
        ".bmp",
        ".csv",
        ".docx",
        ".epub",
        ".flac",
        ".gif",
        ".htm",
        ".html",
        ".ipynb",
        ".jpeg",
        ".jpg",
        ".json",
        ".jsonl",
        ".m4a",
        ".markdown",
        ".md",
        ".mp3",
        ".mp4",
        ".msg",
        ".ogg",
        ".pdf",
        ".png",
        ".pptx",
        ".text",
        ".tiff",
        ".txt",
        ".wav",
        ".webp",
        ".xls",
        ".xlsx",
        ".xml",
        ".zip",
    }
)
LOCAL_SUPABASE_HOSTS = {"127.0.0.1", "::1", "localhost", "host.docker.internal"}
logger = logging.getLogger(__name__)


def _require_supabase_url() -> str:
    supabase_url = (
        os.getenv("SUPABASE_URL")
        or os.getenv("SUPABASE_SERVER_URL")
        or os.getenv("DOCKER_INTERNAL_SUPABASE_URL")
        or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    ).strip()
    if not supabase_url:
        raise HTTPException(status_code=500, detail="Supabase host is not configured")
    return supabase_url if "://" in supabase_url else f"https://{supabase_url}"


def _parse_url(value: str) -> URL:
    if "\\" in value or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        raise HTTPException(status_code=400, detail="Invalid URL")
    try:
        if "@" in urlsplit(value).netloc:
            raise ValueError("Userinfo is not allowed")
        parsed = URL(value)
        # Force validation of IDNA and port before opening a network session.
        if not parsed.raw_host or parsed.user is not None or parsed.password is not None:
            raise ValueError("Invalid authority")
        _ = parsed.port
    except (ValueError, UnicodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid URL authority") from error
    return parsed


def _validate_signed_url(signed_url: str, configured_supabase_url: str) -> URL:
    try:
        configured = _parse_url(configured_supabase_url)
        if configured.scheme != "https" and not (
            configured.scheme == "http" and configured.raw_host in LOCAL_SUPABASE_HOSTS
        ):
            raise ValueError("Invalid configured scheme")
    except (HTTPException, ValueError) as error:
        raise HTTPException(status_code=500, detail="Invalid Supabase URL configuration") from error

    parsed = _parse_url(signed_url)
    if parsed.scheme != configured.scheme:
        raise HTTPException(status_code=400, detail="Invalid signed URL scheme")
    if parsed.raw_host != configured.raw_host or parsed.port != configured.port:
        raise HTTPException(status_code=400, detail="Invalid signed URL host or port")
    if not parsed.path.startswith("/storage/v1/object/sign/"):
        raise HTTPException(status_code=400, detail="Invalid Supabase signed URL")
    if not any(token.strip() for token in parsed.query.getall("token", [])):
        raise HTTPException(status_code=400, detail="Invalid signed URL token")

    # Construct the request authority solely from trusted configuration.
    return URL.build(
        scheme=configured.scheme,
        authority=configured.raw_authority,
        path=parsed.raw_path,
        query_string=parsed.raw_query_string,
        encoded=True,
    )


def _validate_direct_youtube_url(url: str) -> str:
    parsed = _parse_url(url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Invalid YouTube URL scheme")
    if parsed.raw_host not in YOUTUBE_HOSTS or parsed.port != 443:
        raise HTTPException(status_code=400, detail="Unsupported direct URL host")

    if parsed.raw_host in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.removeprefix("/")
    elif parsed.path == "/watch":
        video_id = parsed.query.get("v", "")
    elif parsed.path.startswith(("/shorts/", "/embed/", "/live/")):
        video_id = parsed.path.split("/", 2)[2]
    else:
        video_id = ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    return f"https://www.youtube.com/watch?v={video_id}"


def _safe_temp_suffix(suffix: str) -> str:
    normalized = suffix.lower()
    return next((extension for extension in SUPPORTED_SUFFIXES if extension == normalized), "")


def _normalize_original_name(filename: str | None) -> str:
    return (filename or "upload.bin").strip() or "upload.bin"


def _validate_content_length(content_length_raw: str | None) -> None:
    if not content_length_raw:
        return
    try:
        content_length = int(content_length_raw)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail="Invalid Content-Length from signed URL",
        ) from error
    if content_length > MAX_MARKITDOWN_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50MB limit")


async def _download_signed_url_to_temp(
    signed_url: str,
    suffix: str,
    configured_supabase_url: str,
) -> tuple[str, int]:
    request_url = _validate_signed_url(signed_url, configured_supabase_url)
    safe_suffix = _safe_temp_suffix(suffix)
    timeout = aiohttp.ClientTimeout(total=60)
    downloaded_bytes = 0
    temp_path = ""

    try:
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.get(request_url, allow_redirects=False) as response,
        ):
            if response.status >= 300:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Failed to download from signed URL ({response.status})"),
                )

            _validate_content_length(response.headers.get("Content-Length"))

            with tempfile.NamedTemporaryFile(delete=False, suffix=safe_suffix) as tmp:
                temp_path = tmp.name
                async for chunk in response.content.iter_chunked(1024 * 256):
                    if not chunk:
                        continue
                    downloaded_bytes += len(chunk)
                    if downloaded_bytes > MAX_MARKITDOWN_BYTES:
                        raise HTTPException(status_code=413, detail="File exceeds 50MB limit")
                    tmp.write(chunk)

        return temp_path, downloaded_bytes
    except Exception:
        _cleanup_temp_file(temp_path)
        raise


def _convert_temp_file_sync(
    temp_path: str,
    enable_plugins: bool,
) -> tuple[str, str | None]:
    converter = MarkItDown(enable_plugins=enable_plugins)
    result = converter.convert(temp_path)
    markdown = (getattr(result, "text_content", "") or "").strip()
    title = getattr(result, "title", None)
    return markdown, title


def _convert_url_sync(
    url: str,
    enable_plugins: bool,
) -> tuple[str, str | None]:
    source_url = _validate_direct_youtube_url(url)
    # Fetch only the canonical video page; never let convert_uri follow redirects.
    with requests.get(source_url, stream=True, timeout=60, allow_redirects=False) as response:
        if response.status_code >= 300:
            raise HTTPException(status_code=400, detail="Failed to download YouTube page")
        converter = MarkItDown(enable_plugins=enable_plugins)
        result = converter.convert_response(response)
    markdown = (getattr(result, "text_content", "") or "").strip()
    title = getattr(result, "title", None)
    return markdown, title


async def _convert_temp_file(
    temp_path: str,
    enable_plugins: bool,
) -> tuple[str, str | None]:
    return await asyncio.to_thread(_convert_temp_file_sync, temp_path, enable_plugins)


async def _convert_url(
    url: str,
    enable_plugins: bool,
) -> tuple[str, str | None]:
    return await asyncio.to_thread(_convert_url_sync, url, enable_plugins)


def _cleanup_temp_file(temp_path: str) -> None:
    try:
        temp_file = Path(temp_path) if temp_path else None
        if temp_file and temp_file.exists():
            temp_file.unlink()
    except Exception:
        logger.exception("markitdown cleanup failed")


async def handle_markitdown(
    signed_url: str | None,
    filename: str | None,
    enable_plugins: bool,
    url: str | None = None,
) -> dict[str, object]:
    """Convert a signed Supabase file URL or direct YouTube URL to markdown."""
    signed_url = (signed_url or "").strip()
    url = (url or "").strip()

    if bool(signed_url) == bool(url):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of signed_url or url",
        )

    original_name = _normalize_original_name(filename)
    suffix = Path(original_name).suffix
    temp_path = ""

    try:
        if url:
            source_url = _validate_direct_youtube_url(url)
            markdown, title = await _convert_url(source_url, enable_plugins)

            if not markdown:
                raise HTTPException(
                    status_code=422,
                    detail="MarkItDown returned empty markdown",
                )

            return {
                "ok": True,
                "markdown": markdown,
                "title": title,
                "filename": original_name,
                "url": source_url,
            }

        configured_supabase_url = _require_supabase_url()

        temp_path, downloaded_bytes = await _download_signed_url_to_temp(
            signed_url,
            suffix,
            configured_supabase_url,
        )

        if downloaded_bytes == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        markdown, title = await _convert_temp_file(temp_path, enable_plugins)

        if not markdown:
            raise HTTPException(status_code=422, detail="MarkItDown returned empty markdown")

        return {
            "ok": True,
            "markdown": markdown,
            "title": title,
            "filename": original_name,
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("markitdown conversion failed")
        raise HTTPException(status_code=500, detail="Failed to convert file") from error
    finally:
        _cleanup_temp_file(temp_path)
