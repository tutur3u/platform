import pytest
from fastapi import HTTPException

import markitdown_service


def test_resolve_supabase_hostname_uses_server_url_fallback(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVER_URL", "http://host.docker.internal:8001")

    assert markitdown_service._resolve_supabase_hostname() == "host.docker.internal"


def test_validate_signed_url_allows_local_docker_supabase_http():
    markitdown_service._validate_signed_url(
        "http://host.docker.internal:8001/storage/v1/object/sign/workspaces/file.docx?token=signed-token",
        "host.docker.internal",
    )


def test_validate_signed_url_still_rejects_remote_http():
    with pytest.raises(HTTPException) as error:
        markitdown_service._validate_signed_url(
            "http://project-ref.supabase.co/storage/v1/object/sign/workspaces/file.docx?token=signed-token",
            "project-ref.supabase.co",
        )

    assert error.value.status_code == 400
    assert error.value.detail == "Invalid signed URL scheme"


def test_validate_direct_youtube_url_accepts_short_links():
    assert (
        markitdown_service._validate_direct_youtube_url("https://youtu.be/dQw4w9WgXcQ")
        == "https://youtu.be/dQw4w9WgXcQ"
    )


def test_validate_direct_youtube_url_rejects_non_youtube_hosts():
    with pytest.raises(HTTPException) as error:
        markitdown_service._validate_direct_youtube_url("https://example.com/video")

    assert error.value.status_code == 400
    assert error.value.detail == "Unsupported direct URL host"


@pytest.mark.asyncio
async def test_handle_markitdown_converts_direct_youtube_url(monkeypatch):
    async def convert_url(url: str, enable_plugins: bool):
        assert url == "https://youtu.be/dQw4w9WgXcQ"
        assert enable_plugins is True
        return "# Transcript", "Video title"

    monkeypatch.setattr(markitdown_service, "_convert_url", convert_url)

    result = await markitdown_service.handle_markitdown(
        signed_url=None,
        filename="video.md",
        enable_plugins=True,
        url="https://youtu.be/dQw4w9WgXcQ",
    )

    assert result == {
        "ok": True,
        "markdown": "# Transcript",
        "title": "Video title",
        "filename": "video.md",
        "url": "https://youtu.be/dQw4w9WgXcQ",
    }


@pytest.mark.asyncio
async def test_handle_markitdown_requires_one_source():
    with pytest.raises(HTTPException) as error:
        await markitdown_service.handle_markitdown(
            signed_url=None,
            filename=None,
            enable_plugins=True,
            url=None,
        )

    assert error.value.status_code == 400
    assert error.value.detail == "Provide exactly one of signed_url or url"
