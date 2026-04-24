from fastapi import HTTPException
import pytest

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
