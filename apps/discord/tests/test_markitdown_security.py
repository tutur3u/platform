import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from yarl import URL

import markitdown_service as service

ORIGIN = "https://project-ref.supabase.co"
SIGNED_PATH = "/storage/v1/object/sign/workspaces/file.pdf?token=test-fixture"


@pytest.fixture
def download_response(monkeypatch, tmp_path):
    class Response:
        def __init__(self):
            self.status = 200
            self.headers = {}
            self.chunks = [b"document"]
            self.read_count = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def iter_chunked(self, size):
            assert size == 1024 * 256
            for chunk in self.chunks:
                self.read_count += 1
                yield chunk

    response = Response()
    response.content = response
    response.url = URL(ORIGIN + SIGNED_PATH)
    get = Mock(return_value=response)

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def get(self, *args, **kwargs):
            return get(*args, **kwargs)

    session = Mock(return_value=Session())
    monkeypatch.setattr(service.aiohttp, "ClientSession", session)
    monkeypatch.setattr(service.tempfile, "tempdir", str(tmp_path))
    return response, session, get


@pytest.mark.parametrize(
    "origin",
    [
        "https://attacker.example",
        "https://project-ref.supabase.co.attacker.example",
        "https://169.254.169.254",
        "https://127.0.0.1",
        "https://[::1]",
        "https://[::ffff:169.254.169.254]",
        "https://metadata.google.internal",
        "https://project-ref.supabase.co@attacker.example",
        "https://user@project-ref.supabase.co",
        "https://user:password@project-ref.supabase.co",
        "https://@project-ref.supabase.co",
        "http://project-ref.supabase.co",
        "https://project-ref.supabase.co:8443",
        "https://project-ref.supabase.co:invalid",
        "https://project-ref.supabase.co:65536",
        "https://project-ref.supabase.co.",
        "https://project-ref.supabase.co\\@attacker.example",
        "https://project-ref.supabase.co\n",
        "https://%70roject-ref.supabase.co",
        "https://project-ref%2esupabase.co",
        "https://project-ref.supabase.co%2fattacker.example",
        "https://project-ref.supabase\u3002co.attacker.example",
        "https://project-ref.supabase\uff0eco.attacker.example",
    ],
)
@pytest.mark.asyncio
async def test_download_rejects_untrusted_authority_before_session(origin, download_response):
    response, session, get = download_response
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(origin + SIGNED_PATH, ".pdf", ORIGIN)
    assert error.value.status_code == 400
    session.assert_not_called()
    get.assert_not_called()
    assert response.read_count == 0


@pytest.mark.parametrize(
    ("origin", "configured"),
    [
        ("https://PROJECT-REF.SUPABASE.CO", ORIGIN),
        ("https://project-ref.supabase.co:443", ORIGIN),
        (ORIGIN, "https://PROJECT-REF.SUPABASE.CO:443"),
        ("https://project-ref.supabase\u3002co", ORIGIN),
        ("https://project-ref.supabase\uff0eco", ORIGIN),
        ("https://bücher.example", "https://xn--bcher-kva.example"),
        ("https://XN--BCHER-KVA.EXAMPLE", "https://BÜCHER.example"),
        ("https://project-ref.supabase.co:8443", ORIGIN + ":8443"),
        ("http://host.docker.internal:8001", "http://host.docker.internal:8001"),
        ("http://[::1]:8001", "http://[::1]:8001"),
    ],
)
@pytest.mark.asyncio
async def test_download_accepts_only_configured_origin(origin, configured, download_response):
    _response, session, get = download_response
    path, size = await service._download_signed_url_to_temp(
        origin + SIGNED_PATH, ".PDF", configured
    )
    try:
        assert await asyncio.to_thread(Path(path).read_bytes) == b"document"
        assert Path(path).suffix == ".pdf"
        assert size == len(b"document")
        get.assert_called_once()
        fetched_url = get.call_args.args[0]
        configured_url = URL(configured)
        assert fetched_url.scheme == configured_url.scheme
        assert fetched_url.raw_host == configured_url.raw_host
        assert fetched_url.port == configured_url.port
        assert fetched_url.explicit_port == configured_url.explicit_port
        assert fetched_url.raw_authority == configured_url.raw_authority
        assert fetched_url.raw_path == SIGNED_PATH.partition("?")[0]
        assert fetched_url.raw_query_string == SIGNED_PATH.partition("?")[2]
        assert fetched_url.fragment == ""
        assert get.call_args.kwargs == {"allow_redirects": False}
        assert session.call_args.kwargs["timeout"].total == 60
    finally:
        service._cleanup_temp_file(path)


@pytest.mark.parametrize(
    ("origin", "configured"),
    [
        ("http://localhost", "https://localhost"),
        ("http://localhost:9000", "http://localhost:8001"),
        ("http://host.docker.internal:9000", "http://host.docker.internal:8001"),
    ],
)
@pytest.mark.asyncio
async def test_local_http_requires_explicit_scheme_and_port(origin, configured, download_response):
    _response, session, _get = download_response
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(origin + SIGNED_PATH, ".pdf", configured)
    assert error.value.status_code == 400
    session.assert_not_called()


@pytest.mark.parametrize(
    "raw_path",
    [
        "/storage/v1/object/sign/..%2F..%2F..%2F..%2Frest/v1/users",
        "/storage/v1/object/sign/workspaces/file%2fname.pdf",
        "/storage/v1/object/sign/workspaces/file%2Fname.pdf",
        "/storage/v1/object/sign/workspaces/file%5cname.pdf",
        "/storage/v1/object/sign/workspaces/file%5Cname.pdf",
        "/storage/v1/object/sign/workspaces/./file.pdf",
        "/storage/v1/object/sign/workspaces/../file.pdf",
        "/storage/v1/object/sign/workspaces/%2e/file.pdf",
        "/storage/v1/object/sign/workspaces/%2E/file.pdf",
        "/storage/v1/object/sign/workspaces/%2e%2e/file.pdf",
        "/storage/v1/object/sign/workspaces/%2E%2E/file.pdf",
        "/storage/v1/object/sign/workspaces/.%2e/file.pdf",
        "/storage/v1/object/sign/workspaces/%2e./file.pdf",
        "/storage/v1/object/sign/workspaces/.",
        "/storage/v1/object/sign/workspaces/..",
        "/storage/v1/object/sign/workspaces/%2e",
        "/storage/v1/object/sign/workspaces/%2e%2e",
        "/storage/v1/object/./sign/workspaces/file.pdf",
        "/storage/v1/object/%2e/sign/workspaces/file.pdf",
        "/storage%2fv1/object/sign/workspaces/file.pdf",
        "/%73torage/v1/object/sign/workspaces/file.pdf",
    ],
)
@pytest.mark.asyncio
async def test_download_rejects_ambiguous_raw_path_before_session(raw_path, download_response):
    response, session, get = download_response
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(
            ORIGIN + raw_path + "?token=test-fixture", ".pdf", ORIGIN
        )
    assert error.value.status_code == 400
    session.assert_not_called()
    get.assert_not_called()
    assert response.read_count == 0


@pytest.mark.parametrize(
    "raw_path",
    [
        "/storage/v1/object/sign/workspaces/file%20name.pdf",
        "/storage/v1/object/sign/workspaces/%23file.pdf",
        "/storage/v1/object/sign/workspaces/.hidden/file..pdf",
        "/storage/v1/object/sign/workspaces/%E6%96%87%E4%BB%B6.pdf",
    ],
)
@pytest.mark.asyncio
async def test_download_sends_validated_raw_path_without_fragment(raw_path, download_response):
    _response, _session, get = download_response
    path, _size = await service._download_signed_url_to_temp(
        ORIGIN + raw_path + "?token=test-fixture#@attacker.example", ".pdf", ORIGIN
    )
    try:
        fetched_url = get.call_args.args[0]
        assert fetched_url.raw_path == raw_path
        assert fetched_url.raw_authority == URL(ORIGIN).raw_authority
        assert fetched_url.raw_query_string == "token=test-fixture"
        assert fetched_url.fragment == ""
    finally:
        service._cleanup_temp_file(path)


@pytest.mark.asyncio
async def test_cancelled_download_cleans_partial_file(monkeypatch, download_response, tmp_path):
    response, _session, _get = download_response
    partial_written = asyncio.Event()

    async def chunks(_size):
        yield b"partial document"
        partial_written.set()
        await asyncio.Future()

    monkeypatch.setattr(response, "iter_chunked", chunks)
    task = asyncio.create_task(
        service._download_signed_url_to_temp(ORIGIN + SIGNED_PATH, ".pdf", ORIGIN)
    )
    try:
        await asyncio.wait_for(partial_written.wait(), timeout=1)
        assert len(list(tmp_path.iterdir())) == 1
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
@pytest.mark.asyncio
async def test_download_never_follows_redirects(status, download_response, tmp_path):
    response, _session, get = download_response
    response.status = status
    response.headers = {"Location": "http://169.254.169.254/private"}
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(ORIGIN + SIGNED_PATH, ".pdf", ORIGIN)
    assert error.value.status_code == 400
    get.assert_called_once_with(URL(ORIGIN + SIGNED_PATH), allow_redirects=False)
    assert response.read_count == 0
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("suffix", ["../../x", "/abs", ".pdf/../x", ".pdf\\x", ".pdf\0", ".pdf\n"])
@pytest.mark.asyncio
async def test_download_omits_unsafe_suffix(suffix, download_response, tmp_path):
    _response, _session, _get = download_response
    path, _size = await service._download_signed_url_to_temp(ORIGIN + SIGNED_PATH, suffix, ORIGIN)
    try:
        assert Path(path).parent == tmp_path
        assert Path(path).suffix == ""
        assert await asyncio.to_thread(Path(path).read_bytes) == b"document"
    finally:
        service._cleanup_temp_file(path)


@pytest.mark.parametrize(
    ("suffix", "expected"), [(".pdf", ".pdf"), (".PDF", ".pdf"), (".unknown", "")]
)
def test_temp_suffix_is_selected_from_supported_constants(suffix, expected):
    assert service._safe_temp_suffix(suffix) == expected


@pytest.mark.parametrize("suffix", [".ipynb", ".jsonl", ".markdown", ".msg", ".text"])
def test_supported_converter_suffixes_are_preserved(suffix):
    assert service._safe_temp_suffix(suffix) == suffix


@pytest.mark.parametrize("content_length", ["invalid", str(service.MAX_MARKITDOWN_BYTES + 1)])
@pytest.mark.asyncio
async def test_download_checks_content_length_before_writing(
    content_length, download_response, tmp_path
):
    response, _session, _get = download_response
    response.headers = {"Content-Length": content_length}
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(ORIGIN + SIGNED_PATH, ".pdf", ORIGIN)
    assert error.value.status_code == (400 if content_length == "invalid" else 413)
    assert response.read_count == 0
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_download_stream_cap_cleans_partial_file(monkeypatch, download_response, tmp_path):
    response, _session, _get = download_response
    monkeypatch.setattr(service, "MAX_MARKITDOWN_BYTES", 8)
    response.headers = {"Content-Length": "4"}
    response.chunks = [b"data", b"more", b"overflow"]
    with pytest.raises(HTTPException) as error:
        await service._download_signed_url_to_temp(ORIGIN + SIGNED_PATH, ".pdf", ORIGIN)
    assert error.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_handle_signed_file_preserves_conversion_and_cleanup(
    monkeypatch, download_response, tmp_path
):
    monkeypatch.setenv("SUPABASE_URL", ORIGIN)

    async def convert(path, enable_plugins):
        assert await asyncio.to_thread(Path(path).read_bytes) == b"document"
        assert Path(path).suffix == ".pdf"
        assert enable_plugins is False
        return "# Converted", "Title"

    monkeypatch.setattr(service, "_convert_temp_file", convert)
    result = await service.handle_markitdown(ORIGIN + SIGNED_PATH, "file.PDF", False)
    assert result == {
        "ok": True,
        "markdown": "# Converted",
        "title": "Title",
        "filename": "file.PDF",
    }
    assert list(tmp_path.iterdir()) == []
    download_response[2].assert_called_once()


@pytest.mark.parametrize(
    "url",
    [
        "https://attacker.example/watch?v=dQw4w9WgXcQ",
        "https://169.254.169.254/watch?v=dQw4w9WgXcQ",
        "https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ",
        "https://youtube.com@attacker.example/watch?v=dQw4w9WgXcQ",
        "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com:8443/watch?v=dQw4w9WgXcQ",
        "http://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/redirect?q=https://attacker.example",
        "https://youtu.be/redirect?url=https://attacker.example",
        "https://youtube.com/watch?v=../../redirect",
        "https://youtu.be/dQw4w9WgXcQ/extra",
    ],
)
def test_youtube_conversion_rejects_untrusted_input_before_fetch(monkeypatch, url):
    get = Mock()
    converter = Mock()
    monkeypatch.setattr(service.requests, "get", get)
    monkeypatch.setattr(service, "MarkItDown", converter)
    with pytest.raises(HTTPException) as error:
        service._convert_url_sync(url, False)
    assert error.value.status_code == 400
    get.assert_not_called()
    converter.assert_not_called()


@pytest.mark.parametrize(
    "url",
    [
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&next=https://attacker.example",
        "https://m.youtube.com/shorts/dQw4w9WgXcQ",
        "https://youtube-nocookie.com/embed/dQw4w9WgXcQ",
        "https://music.youtube.com/live/dQw4w9WgXcQ",
    ],
)
def test_youtube_conversion_fetches_canonical_page_without_redirects(monkeypatch, url):
    response = Mock(status_code=200)
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    get = Mock(return_value=response)
    converter = Mock()
    converter.convert_response.return_value = SimpleNamespace(text_content="# Video", title="Title")
    monkeypatch.setattr(service.requests, "get", get)
    monkeypatch.setattr(service, "MarkItDown", Mock(return_value=converter))
    assert service._convert_url_sync(url, False) == ("# Video", "Title")
    get.assert_called_once_with(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        stream=True,
        timeout=60,
        allow_redirects=False,
    )
    converter.convert_response.assert_called_once_with(response)
    converter.convert_uri.assert_not_called()


def test_youtube_conversion_rejects_redirect_before_library(monkeypatch):
    response = Mock(status_code=302, headers={"Location": "http://169.254.169.254/private"})
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    get = Mock(return_value=response)
    converter = Mock()
    monkeypatch.setattr(service.requests, "get", get)
    monkeypatch.setattr(service, "MarkItDown", converter)
    with pytest.raises(HTTPException) as error:
        service._convert_url_sync("https://youtu.be/dQw4w9WgXcQ", False)
    assert error.value.status_code == 400
    assert get.call_args.kwargs["allow_redirects"] is False
    converter.assert_not_called()
    response.__exit__.assert_called_once()
