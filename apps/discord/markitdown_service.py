"""Utilities for handling MarkItDown file conversion requests."""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import aiohttp
from fastapi import HTTPException
from markitdown import MarkItDown

MAX_MARKITDOWN_BYTES = 50 * 1024 * 1024
logger = logging.getLogger(__name__)


def _resolve_supabase_hostname() -> str | None:
    supabase_url = (os.getenv("SUPABASE_URL") or "").strip()
    if not supabase_url:
        return None

    parsed = urlparse(supabase_url)
    if parsed.hostname:
        return parsed.hostname.lower()

    parsed_with_scheme = (
        urlparse(f"https://{supabase_url}") if "://" not in supabase_url else parsed
    )
    if parsed_with_scheme.hostname:
        return parsed_with_scheme.hostname.lower()

    return None


def _require_supabase_hostname() -> str:
    configured_supabase_host = _resolve_supabase_hostname()
    if configured_supabase_host:
        return configured_supabase_host
    raise HTTPException(status_code=500, detail="Supabase host is not configured")


def _validate_signed_url(signed_url: str, configured_supabase_host: str) -> None:
    parsed = urlparse(signed_url)

    is_local_host = configured_supabase_host in ("127.0.0.1", "localhost")
    allowed_schemes = ("http", "https") if is_local_host else ("https",)

    if parsed.scheme not in allowed_schemes:
        raise HTTPException(status_code=400, detail="Invalid signed URL scheme")
    if parsed.hostname is None or parsed.hostname.lower() != configured_supabase_host:
        raise HTTPException(status_code=400, detail="Invalid signed URL host")
    if not parsed.path.startswith("/storage/v1/object/sign/"):
        raise HTTPException(status_code=400, detail="Invalid Supabase signed URL")
    token = next(
        (value.strip() for value in parse_qs(parsed.query).get("token", []) if value),
        "",
    )
    if not token:
        raise HTTPException(status_code=400, detail="Invalid signed URL token")


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


def _validate_resolved_response_host(
    response_host: str | None,
    allowed_hosts: set[str],
) -> None:
    normalized_host = response_host.lower() if response_host else None
    if normalized_host is None or normalized_host not in allowed_hosts:
        raise HTTPException(status_code=400, detail="Invalid signed URL host")


async def _download_signed_url_to_temp(
    signed_url: str,
    suffix: str,
    configured_supabase_host: str,
) -> tuple[str, int]:
    timeout = aiohttp.ClientTimeout(total=60)
    downloaded_bytes = 0
    temp_path = ""
    signed_url_host = urlparse(signed_url).hostname
    allowed_hosts = {configured_supabase_host}
    if signed_url_host:
        allowed_hosts.add(signed_url_host.lower())

    try:
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.get(signed_url) as response,
        ):
            if response.status >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Failed to download from signed URL ({response.status})"),
                )

            _validate_resolved_response_host(response.url.host, allowed_hosts)
            _validate_content_length(response.headers.get("Content-Length"))

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
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


async def _convert_temp_file(
    temp_path: str,
    enable_plugins: bool,
) -> tuple[str, str | None]:
    return await asyncio.to_thread(_convert_temp_file_sync, temp_path, enable_plugins)


def _cleanup_temp_file(temp_path: str) -> None:
    try:
        temp_file = Path(temp_path) if temp_path else None
        if temp_file and temp_file.exists():
            temp_file.unlink()
    except Exception:
        logger.exception("markitdown cleanup failed")


async def handle_markitdown(
    signed_url: str,
    filename: str | None,
    enable_plugins: bool,
) -> dict[str, object]:
    """Download a signed Supabase URL and convert the file to markdown."""
    if not signed_url:
        raise HTTPException(status_code=400, detail="signed_url is required")

    configured_supabase_host = _require_supabase_hostname()
    _validate_signed_url(signed_url, configured_supabase_host)

    original_name = _normalize_original_name(filename)
    suffix = Path(original_name).suffix
    temp_path = ""

    try:
        temp_path, downloaded_bytes = await _download_signed_url_to_temp(
            signed_url,
            suffix,
            configured_supabase_host,
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
