"""Offline compatibility and security contracts for locked auth/HTTP dependencies."""

import base64
import http.client
import io
import ssl
import unittest
import zlib

import jwt
import pytest
import requests
import urllib3


class DependencySecurityTests(unittest.TestCase):
    """Use synthetic tokens and response bytes; never contact an external service."""

    signing_key = b"offline-security-regression-key-at-least-32-bytes"

    def test_signed_token_round_trip_and_algorithm_allowlist(self):
        token = jwt.encode({"sub": "offline-user"}, self.signing_key, algorithm="HS256")
        assert jwt.decode(token, self.signing_key, algorithms=["HS256"])["sub"] == "offline-user"
        with pytest.raises(jwt.InvalidAlgorithmError):
            jwt.decode(token, self.signing_key, algorithms=["HS512"])
        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(token, b"different-offline-key-at-least-32-bytes", algorithms=["HS256"])

    def test_padded_signature_is_accepted_but_non_alphabet_junk_is_rejected(self):
        token = jwt.encode({"sub": "offline-user"}, self.signing_key, algorithm="HS256")
        padded = token + "=" * (-len(token.rsplit(".", 1)[1]) % 4)
        assert jwt.decode(padded, self.signing_key, algorithms=["HS256"])["sub"] == "offline-user"
        with pytest.raises(jwt.DecodeError):
            jwt.decode(token + "!!!!", self.signing_key, algorithms=["HS256"])

    def test_deeply_nested_payload_raises_documented_decode_error(self):
        payload = b'{"nested":' + b"[" * 20000 + b"0" + b"]" * 20000 + b"}"
        token = jwt.api_jws.encode(payload, self.signing_key, algorithm="HS256")
        with pytest.raises(jwt.DecodeError):
            jwt.decode(token, self.signing_key, algorithms=["HS256"])

    def test_malformed_time_claims_raise_documented_jwt_errors(self):
        for claim in ["exp", "nbf", "iat"]:
            with self.subTest(claim=claim):
                token = jwt.encode({claim: []}, self.signing_key, algorithm="HS256")
                with pytest.raises(jwt.PyJWTError):
                    jwt.decode(token, self.signing_key, algorithms=["HS256"])

    def test_jwks_cache_retains_parsed_set_without_refetching(self):
        key = base64.urlsafe_b64encode(self.signing_key).rstrip(b"=").decode()

        class OfflineJwkClient(jwt.PyJWKClient):
            fetches = 0

            def fetch_data(self):
                self.fetches += 1
                return {"keys": [{"kty": "oct", "k": key, "kid": "offline", "alg": "HS256"}]}

        client = OfflineJwkClient("https://offline.invalid/jwks")
        first = client.get_jwk_set()
        assert client.get_jwk_set() is first
        assert client.fetches == 1
        assert first.keys[0].key_id == "offline"

    @staticmethod
    def chunked_response(chunk_bytes):
        wire = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n" + chunk_bytes

        class OfflineSocket:
            def makefile(self, _mode):
                return io.BytesIO(wire)

        original = http.client.HTTPResponse(OfflineSocket(), method="GET")
        original.begin()
        return urllib3.HTTPResponse(
            body=original,
            headers=original.getheaders(),
            original_response=original,
            preload_content=False,
        )

    def test_chunked_response_preserves_valid_body(self):
        response = self.chunked_response(b"5\r\nhello\r\n0\r\n\r\n")
        try:
            assert b"".join(response.read_chunked()) == b"hello"
        finally:
            response.close()

    def test_oversized_chunk_extension_is_rejected(self):
        # A bounded 128KiB line exceeds the parser's 64KiB security limit.
        response = self.chunked_response(b"1;" + b"x" * (128 * 1024) + b"\r\na\r\n0\r\n\r\n")
        try:
            with pytest.raises(urllib3.exceptions.ProtocolError):
                list(response.read_chunked())
        finally:
            response.close()

    def test_requests_decodes_deflate_stream_with_current_urllib3(self):
        raw = urllib3.HTTPResponse(
            body=io.BytesIO(zlib.compress(b"offline Discord response")),
            headers={"Content-Encoding": "deflate"},
            preload_content=False,
        )
        response = requests.Response()
        response.raw = raw
        try:
            assert b"".join(response.iter_content(7)) == b"offline Discord response"
        finally:
            response.close()

    def test_https_proxy_and_destination_keep_distinct_tls_contexts(self):
        proxy_context = ssl.create_default_context()
        destination_context = ssl.create_default_context()
        manager = urllib3.ProxyManager(
            "https://proxy.invalid:443",
            proxy_ssl_context=proxy_context,
            proxy_assert_hostname="proxy.invalid",
            ssl_context=destination_context,
        )
        try:
            pool = manager.connection_from_url("https://destination.invalid")
            assert pool.conn_kw["ssl_context"] is destination_context
            assert pool.proxy_config.ssl_context is proxy_context
            assert pool.proxy_config.assert_hostname == "proxy.invalid"
        finally:
            manager.clear()


if __name__ == "__main__":
    unittest.main()
