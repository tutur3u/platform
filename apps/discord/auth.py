"""Authentication and request verification for Discord interactions."""

import os

from fastapi.exceptions import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


class DiscordAuth:
    """Handles Discord request authentication."""

    @staticmethod
    def verify_request(headers: dict, body: bytes) -> None:
        """Verify that the request is from Discord using their public key."""
        print("🤖: authenticating request")

        # Get Discord public key from environment
        public_key = os.getenv("DISCORD_PUBLIC_KEY")

        if not public_key:
            raise HTTPException(status_code=500, detail="DISCORD_PUBLIC_KEY is not set")

        # Create verify key
        verify_key = VerifyKey(bytes.fromhex(public_key))

        # Get signature and timestamp from headers
        signature = headers.get("X-Signature-Ed25519")
        timestamp = headers.get("X-Signature-Timestamp")

        if not signature or not timestamp:
            raise HTTPException(status_code=401, detail="Missing signature headers")

        # Create message for verification
        message = timestamp.encode() + body

        try:
            verify_key.verify(message, bytes.fromhex(signature))
        except BadSignatureError as error:
            # Either an unauthorized request or Discord's "negative control" check
            raise HTTPException(status_code=401, detail="Invalid request") from error
