"""Validation and replay protection for Discord interaction dispatch."""

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

from fastapi.exceptions import HTTPException
from fastapi.requests import Request

from auth import DiscordAuth
from config import DiscordInteractionType, DiscordResponseType
from utils import (
    claim_discord_interaction,
    complete_discord_interaction,
    release_discord_interaction,
    renew_discord_interaction_claim,
)

logger = logging.getLogger(__name__)

SUPPORTED_INTERACTION_TYPES = {
    DiscordInteractionType.PING,
    DiscordInteractionType.APPLICATION_COMMAND,
    DiscordInteractionType.MESSAGE_COMPONENT,
    DiscordInteractionType.MODAL_SUBMIT,
}
INTERACTION_ID_PATTERN = re.compile(r"^[0-9]{1,32}$")
CLAIM_ID_STATE_KEY = "discord_interaction_claim_id"
CLAIM_OWNERSHIP_STATE_KEY = "discord_interaction_claim_ownership"
CLAIM_TYPE_STATE_KEY = "discord_interaction_claim_type"
DISPATCH_TIMEOUT_SECONDS = 45


async def prepare_interaction_dispatch(
    request: Request,
) -> tuple[dict, int, dict[str, Any] | None]:
    """Verify, parse, validate, and claim an interaction for dispatch."""
    body = await request.body()
    DiscordAuth.verify_request(request.headers, body)
    try:
        data = json.loads(body.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Bad request") from error

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Bad request")

    interaction_type = data.get("type")
    if not isinstance(interaction_type, int) or interaction_type not in SUPPORTED_INTERACTION_TYPES:
        raise HTTPException(status_code=400, detail="Bad request")

    # PING is a side-effect-free endpoint handshake. Keeping it independent of
    # claim storage avoids turning database availability into endpoint downtime.
    if interaction_type == DiscordInteractionType.PING:
        return data, interaction_type, None

    interaction_id = data.get("id")
    if not isinstance(interaction_id, str) or not INTERACTION_ID_PATTERN.fullmatch(interaction_id):
        raise HTTPException(status_code=400, detail="Bad request")

    claim_task = asyncio.create_task(
        asyncio.to_thread(claim_discord_interaction, interaction_id, interaction_type)
    )
    try:
        claim = await asyncio.shield(claim_task)
    except asyncio.CancelledError:
        # Cancelling an await does not stop its worker thread. Wait for the
        # claim result and release any late ownership before propagating the
        # request cancellation, otherwise retries remain fenced until expiry.
        try:
            late_claim = await claim_task
            late_token = late_claim.get("claimToken")
            if late_claim.get("state") == "claimed" and isinstance(late_token, str):
                await asyncio.to_thread(
                    release_discord_interaction,
                    interaction_id,
                    interaction_type,
                    late_token,
                )
        except Exception:
            logger.exception(
                "Failed to clean up canceled Discord interaction claim",
                extra={"interaction_type": interaction_type},
            )
        raise
    except Exception as error:
        logger.exception(
            "Failed to claim Discord interaction",
            extra={"interaction_type": interaction_type},
        )
        raise HTTPException(status_code=503, detail="Interaction claim unavailable") from error

    state = claim.get("state")
    claim_token = claim.get("claimToken")
    if state == "claimed" and isinstance(claim_token, str):
        setattr(request.state, CLAIM_ID_STATE_KEY, interaction_id)
        setattr(request.state, CLAIM_OWNERSHIP_STATE_KEY, claim_token)
        setattr(request.state, CLAIM_TYPE_STATE_KEY, interaction_type)
        return data, interaction_type, None

    if state == "completed" and isinstance(claim.get("response"), dict):
        return data, interaction_type, claim["response"]

    if state != "processing":
        raise HTTPException(status_code=503, detail="Interaction claim unavailable")

    logger.info(
        "Acknowledging duplicate Discord interaction",
        extra={"interaction_type": interaction_type},
    )
    return (
        data,
        interaction_type,
        {"type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE},
    )


def with_discord_interaction_replay(
    handler: Callable[..., Awaitable[dict[str, Any]]],
) -> Callable[..., Awaitable[dict[str, Any]]]:
    """Release failed dispatches and cache successful protocol responses."""

    @wraps(handler)
    async def guarded(request: Request, *args: Any, **kwargs: Any) -> dict[str, Any]:
        try:
            response = await asyncio.wait_for(
                handler(request, *args, **kwargs),
                timeout=DISPATCH_TIMEOUT_SECONDS,
            )
        except BaseException:
            interaction_id = getattr(request.state, CLAIM_ID_STATE_KEY, None)
            claim_token = getattr(request.state, CLAIM_OWNERSHIP_STATE_KEY, None)
            interaction_type = getattr(request.state, CLAIM_TYPE_STATE_KEY, None)
            if (
                isinstance(interaction_id, str)
                and isinstance(claim_token, str)
                and isinstance(interaction_type, int)
            ):
                try:
                    await asyncio.to_thread(
                        release_discord_interaction,
                        interaction_id,
                        interaction_type,
                        claim_token,
                    )
                except Exception:
                    logger.exception(
                        "Failed to release Discord interaction claim",
                        extra={"interaction_type": interaction_type},
                    )
            raise

        interaction_id = getattr(request.state, CLAIM_ID_STATE_KEY, None)
        claim_token = getattr(request.state, CLAIM_OWNERSHIP_STATE_KEY, None)
        interaction_type = getattr(request.state, CLAIM_TYPE_STATE_KEY, None)
        if (
            isinstance(interaction_id, str)
            and isinstance(claim_token, str)
            and isinstance(interaction_type, int)
        ):
            try:
                await _run_blocking_to_completion(
                    renew_discord_interaction_claim,
                    interaction_id,
                    interaction_type,
                    claim_token,
                )
                await _run_blocking_to_completion(
                    complete_discord_interaction,
                    interaction_id,
                    interaction_type,
                    claim_token,
                    response,
                )
            except BaseException as error:
                logger.exception(
                    "Failed to complete Discord interaction claim",
                    extra={"interaction_type": interaction_type},
                )
                try:
                    await _run_blocking_to_completion(
                        release_discord_interaction,
                        interaction_id,
                        interaction_type,
                        claim_token,
                    )
                except Exception:
                    logger.exception(
                        "Failed to release Discord interaction claim",
                        extra={"interaction_type": interaction_type},
                    )
                if isinstance(error, asyncio.CancelledError):
                    raise
                raise HTTPException(
                    status_code=503, detail="Interaction completion unavailable"
                ) from error

        return response

    return guarded


async def _run_blocking_to_completion(function: Callable[..., Any], *args: Any) -> Any:
    """Let an ownership-changing RPC finish even if its request is canceled."""
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        except Exception:
            logger.exception("Canceled Discord interaction RPC failed")
        raise
