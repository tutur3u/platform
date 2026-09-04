"""Authentication and request verification for Discord interactions."""

import logging
import os
import time
from collections.abc import Callable, Mapping

from fastapi.exceptions import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

logger = logging.getLogger(__name__)

# Discord requires the timestamp header to be included in signature verification
# but does not publish a numeric replay tolerance. Five minutes allows ordinary
# delivery jitter while sharply bounding the useful lifetime of a captured request.
DISCORD_SIGNATURE_FRESHNESS_SECONDS = 300


class DiscordAuth:
    """Handles Discord request authentication."""

    @staticmethod
    def verify_request(
        headers: Mapping[str, str],
        body: bytes,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        """Verify that the request is from Discord using their public key."""
        logger.debug("Authenticating Discord interaction request")

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

        try:
            timestamp_seconds = int(timestamp)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=401, detail="Invalid request") from error

        # Create message for verification
        message = timestamp.encode() + body

        try:
            verify_key.verify(message, bytes.fromhex(signature))
        except (BadSignatureError, ValueError) as error:
            # Either an unauthorized request or Discord's "negative control" check
            raise HTTPException(status_code=401, detail="Invalid request") from error

        age_seconds = clock() - timestamp_seconds
        if abs(age_seconds) > DISCORD_SIGNATURE_FRESHNESS_SECONDS:
            raise HTTPException(status_code=401, detail="Invalid request")
