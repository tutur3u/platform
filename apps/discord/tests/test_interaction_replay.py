import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi.exceptions import HTTPException
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

import app
import interaction_replay
from auth import DISCORD_SIGNATURE_FRESHNESS_SECONDS, DiscordAuth


def signed_headers(signing_key: SigningKey, timestamp: int, body: bytes) -> dict[str, str]:
    timestamp_text = str(timestamp)
    signature = signing_key.sign(timestamp_text.encode() + body).signature.hex()
    return {
        "X-Signature-Ed25519": signature,
        "X-Signature-Timestamp": timestamp_text,
    }


@pytest.fixture
def signing_key(monkeypatch: pytest.MonkeyPatch) -> SigningKey:
    key = SigningKey.generate()
    monkeypatch.setenv("DISCORD_PUBLIC_KEY", key.verify_key.encode().hex())
    return key


@pytest.mark.parametrize(
    "offset",
    [-DISCORD_SIGNATURE_FRESHNESS_SECONDS, DISCORD_SIGNATURE_FRESHNESS_SECONDS],
)
def test_signature_freshness_accepts_exact_boundaries(signing_key: SigningKey, offset: int) -> None:
    now = 2_000_000_000
    body = b'{"id":"1","type":1}'
    timestamp = now + offset

    DiscordAuth.verify_request(
        signed_headers(signing_key, timestamp, body), body, clock=lambda: now
    )


@pytest.mark.parametrize(
    "offset",
    [
        -DISCORD_SIGNATURE_FRESHNESS_SECONDS - 1,
        DISCORD_SIGNATURE_FRESHNESS_SECONDS + 1,
    ],
)
def test_signature_freshness_rejects_outside_boundaries(
    signing_key: SigningKey, offset: int
) -> None:
    now = 2_000_000_000
    body = b'{"id":"1","type":1}'
    timestamp = now + offset

    with pytest.raises(HTTPException) as exc_info:
        DiscordAuth.verify_request(
            signed_headers(signing_key, timestamp, body), body, clock=lambda: now
        )

    assert exc_info.value.status_code == 401


def test_signature_freshness_rejects_malformed_timestamp(
    signing_key: SigningKey,
) -> None:
    body = b'{"id":"1","type":1}'
    timestamp = "not-a-timestamp"
    signature = signing_key.sign(timestamp.encode() + body).signature.hex()

    with pytest.raises(HTTPException) as exc_info:
        DiscordAuth.verify_request(
            {
                "X-Signature-Ed25519": signature,
                "X-Signature-Timestamp": timestamp,
            },
            body,
            clock=lambda: 2_000_000_000,
        )

    assert exc_info.value.status_code == 401


def test_signature_freshness_rejects_invalid_signature(
    signing_key: SigningKey,
) -> None:
    now = 2_000_000_000
    body = b'{"id":"1","type":1}'
    headers = signed_headers(signing_key, now, body)
    headers["X-Signature-Ed25519"] = "00" * 64

    with pytest.raises(HTTPException) as exc_info:
        DiscordAuth.verify_request(headers, body, clock=lambda: now)

    assert exc_info.value.status_code == 401


def command_payload(interaction_id: str) -> dict:
    return {
        "application_id": "application-1",
        "data": {"name": "ticket"},
        "id": interaction_id,
        "member": {"user": {"id": "user-1"}},
        "token": "interaction-token",
        "type": 2,
    }


def post_signed(client: TestClient, signing_key: SigningKey, payload: dict, timestamp: int):
    body = json.dumps(payload, separators=(",", ":")).encode()
    return client.post("/api", content=body, headers=signed_headers(signing_key, timestamp, body))


def test_duplicate_delivery_is_acknowledged_without_spawning(
    monkeypatch: pytest.MonkeyPatch, signing_key: SigningKey
) -> None:
    claims = iter([True, False])
    claim = Mock(side_effect=lambda *_args: next(claims))
    spawn = Mock()
    monkeypatch.setattr(interaction_replay, "claim_discord_interaction", claim)
    monkeypatch.setattr(app.reply_ticket, "spawn", spawn)
    client = TestClient(app.web_app.get_raw_f()())
    payload = command_payload("123456789012345678")
    timestamp = int(time.time())

    first = post_signed(client, signing_key, payload, timestamp)
    second = post_signed(client, signing_key, payload, timestamp)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == {"type": 5}
    assert second.json() == {"type": 5}
    assert claim.call_count == 2
    spawn.assert_called_once()


def test_concurrent_duplicate_delivery_spawns_once(
    monkeypatch: pytest.MonkeyPatch, signing_key: SigningKey
) -> None:
    claimed_ids: set[str] = set()
    claim_lock = threading.Lock()

    def claim_once(interaction_id: str, _interaction_type: int) -> bool:
        with claim_lock:
            if interaction_id in claimed_ids:
                return False
            claimed_ids.add(interaction_id)
            return True

    spawn = Mock()
    monkeypatch.setattr(interaction_replay, "claim_discord_interaction", claim_once)
    monkeypatch.setattr(app.reply_ticket, "spawn", spawn)
    client = TestClient(app.web_app.get_raw_f()())
    payload = command_payload("223456789012345678")

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda _: post_signed(client, signing_key, payload, int(time.time())),
                range(2),
            )
        )

    assert [response.status_code for response in responses] == [200, 200]
    assert [response.json() for response in responses] == [{"type": 5}, {"type": 5}]
    spawn.assert_called_once()


def test_claim_store_failure_fails_closed_before_spawn(
    monkeypatch: pytest.MonkeyPatch, signing_key: SigningKey
) -> None:
    spawn = Mock()
    monkeypatch.setattr(
        interaction_replay,
        "claim_discord_interaction",
        Mock(side_effect=RuntimeError("claim unavailable")),
    )
    monkeypatch.setattr(app.reply_ticket, "spawn", spawn)
    client = TestClient(app.web_app.get_raw_f()())

    response = post_signed(
        client,
        signing_key,
        command_payload("323456789012345678"),
        int(time.time()),
    )

    assert response.status_code == 503
    spawn.assert_not_called()


def test_ping_does_not_depend_on_claim_storage(
    monkeypatch: pytest.MonkeyPatch, signing_key: SigningKey
) -> None:
    claim = Mock(side_effect=RuntimeError("claim unavailable"))
    monkeypatch.setattr(interaction_replay, "claim_discord_interaction", claim)
    client = TestClient(app.web_app.get_raw_f()())

    response = post_signed(client, signing_key, {"type": 1}, int(time.time()))

    assert response.status_code == 200
    assert response.json() == {"type": 1}
    claim.assert_not_called()
