"""Regression tests for the hardened MarkItDown signed-URL download path."""

import asyncio
from pathlib import Path

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer
from fastapi import HTTPException

import markitdown_service

SIGNED_PATH = "/storage/v1/object/sign/workspaces/file.docx"
SIGNED_BYTES = b"signed file bytes"


@pytest.fixture
async def supabase_and_internal_servers():
    """Serve a local 'Supabase' host plus a separate 'internal' target host."""
    internal_hits: list[str] = []

    async def internal_handler(request: web.Request) -> web.Response:
        internal_hits.append(str(request.rel_url))
        return web.Response(body=b"internal secret")

    internal_app = web.Application()
    internal_app.router.add_get("/latest/meta-data", internal_handler)
    internal_server = TestServer(internal_app, host="127.0.0.1")
    await internal_server.start_server()

    async def supabase_handler(request: web.Request) -> web.Response:
        if request.query.get("redirect") == "1":
            raise web.HTTPFound(f"http://localhost:{internal_server.port}/latest/meta-data")
        return web.Response(body=SIGNED_BYTES)

    supabase_app = web.Application()
    supabase_app.router.add_get(SIGNED_PATH, supabase_handler)
    supabase_server = TestServer(supabase_app, host="127.0.0.1")
    await supabase_server.start_server()

    try:
        yield supabase_server, internal_hits
    finally:
        await supabase_server.close()
        await internal_server.close()


@pytest.mark.asyncio
async def test_download_refuses_redirects_without_following(supabase_and_internal_servers):
    supabase_server, internal_hits = supabase_and_internal_servers
    signed_url = f"http://127.0.0.1:{supabase_server.port}{SIGNED_PATH}?token=t&redirect=1"

    with pytest.raises(HTTPException) as error:
        await markitdown_service._download_signed_url_to_temp(signed_url, ".docx", "127.0.0.1")

    assert error.value.status_code == 400
    assert error.value.detail == "Signed URL redirects are not allowed"
    assert internal_hits == []


@pytest.mark.asyncio
async def test_download_streams_signed_file_from_configured_host(supabase_and_internal_servers):
    supabase_server, _internal_hits = supabase_and_internal_servers
    signed_url = f"http://127.0.0.1:{supabase_server.port}{SIGNED_PATH}?token=t"

    temp_path, size = await markitdown_service._download_signed_url_to_temp(
        signed_url, ".docx", "127.0.0.1"
    )
    try:
        assert size == len(SIGNED_BYTES)
        assert Path(temp_path).suffix == ".docx"
        assert await asyncio.to_thread(Path(temp_path).read_bytes) == SIGNED_BYTES
    finally:
        markitdown_service._cleanup_temp_file(temp_path)


@pytest.mark.asyncio
async def test_download_rejects_non_supabase_host_before_requesting(monkeypatch):
    def unexpected_session(*_args, **_kwargs):
        raise AssertionError("No request may be made for a non-Supabase host")

    monkeypatch.setattr(markitdown_service.aiohttp, "ClientSession", unexpected_session)

    with pytest.raises(HTTPException) as error:
        await markitdown_service._download_signed_url_to_temp(
            f"https://169.254.169.254{SIGNED_PATH}?token=t",
            ".docx",
            "project-ref.supabase.co",
        )

    assert error.value.detail == "Invalid signed URL host"


def test_validate_signed_url_rebuilds_request_url_from_configured_host():
    assert (
        markitdown_service._validate_signed_url(
            f"https://user:pass@Project-Ref.supabase.co{SIGNED_PATH}?token=t%2Bx#frag",
            "project-ref.supabase.co",
        )
        == f"https://project-ref.supabase.co{SIGNED_PATH}?token=t%2Bx"
    )


def test_validate_signed_url_keeps_local_port():
    assert (
        markitdown_service._validate_signed_url(
            f"http://host.docker.internal:8001{SIGNED_PATH}?token=t",
            "host.docker.internal",
        )
        == f"http://host.docker.internal:8001{SIGNED_PATH}?token=t"
    )


def test_validate_signed_url_rejects_invalid_port():
    with pytest.raises(HTTPException) as error:
        markitdown_service._validate_signed_url(
            f"https://project-ref.supabase.co:99999{SIGNED_PATH}?token=t",
            "project-ref.supabase.co",
        )

    assert error.value.detail == "Invalid signed URL port"


def test_validate_resolved_response_host_only_allows_configured_host():
    with pytest.raises(HTTPException):
        markitdown_service._validate_resolved_response_host(
            "internal.example", {"project-ref.supabase.co"}
        )


@pytest.mark.parametrize(
    ("suffix", "expected"),
    [
        (".docx", ".docx"),
        (".PDF", ".PDF"),
        ("", ""),
        (".tar/../../x", ""),
        (".a b", ""),
        (".\x00", ""),
        ("." + "a" * 17, ""),
        ("docx", ""),
    ],
)
@pytest.mark.asyncio
async def test_download_temp_suffix_is_restricted_to_plain_extensions(
    monkeypatch, supabase_and_internal_servers, suffix, expected
):
    supabase_server, _internal_hits = supabase_and_internal_servers
    created_suffixes: list[str] = []
    real_named_temporary_file = markitdown_service.tempfile.NamedTemporaryFile

    def recording_named_temporary_file(*args, **kwargs):
        created_suffixes.append(kwargs["suffix"])
        return real_named_temporary_file(*args, **kwargs)

    monkeypatch.setattr(
        markitdown_service.tempfile, "NamedTemporaryFile", recording_named_temporary_file
    )
    signed_url = f"http://127.0.0.1:{supabase_server.port}{SIGNED_PATH}?token=t"

    temp_path, _size = await markitdown_service._download_signed_url_to_temp(
        signed_url, suffix, "127.0.0.1"
    )
    markitdown_service._cleanup_temp_file(temp_path)

    assert created_suffixes == [expected]
