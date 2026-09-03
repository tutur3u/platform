"""Validation and replay protection for Discord interaction dispatch."""

import logging

from fastapi.exceptions import HTTPException

from config import DiscordInteractionType, DiscordResponseType
from utils import claim_discord_interaction

logger = logging.getLogger(__name__)

SUPPORTED_INTERACTION_TYPES = {
    DiscordInteractionType.PING,
    DiscordInteractionType.APPLICATION_COMMAND,
    DiscordInteractionType.MESSAGE_COMPONENT,
    DiscordInteractionType.MODAL_SUBMIT,
}


def prepare_interaction_dispatch(data: object) -> tuple[int, dict[str, int] | None]:
    """Validate an interaction and claim side-effecting deliveries once."""
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Bad request")

    interaction_type = data.get("type")
    if not isinstance(interaction_type, int) or interaction_type not in SUPPORTED_INTERACTION_TYPES:
        raise HTTPException(status_code=400, detail="Bad request")

    # PING is a side-effect-free endpoint handshake. Keeping it independent of
    # claim storage avoids turning database availability into endpoint downtime.
    if interaction_type == DiscordInteractionType.PING:
        return interaction_type, None

    interaction_id = data.get("id")
    if not isinstance(interaction_id, str) or not interaction_id.isdigit():
        raise HTTPException(status_code=400, detail="Bad request")

    try:
        claimed = claim_discord_interaction(interaction_id, interaction_type)
    except Exception as error:
        logger.exception(
            "Failed to claim Discord interaction",
            extra={"interaction_type": interaction_type},
        )
        raise HTTPException(status_code=503, detail="Interaction claim unavailable") from error

    if claimed:
        return interaction_type, None

    logger.info(
        "Acknowledging duplicate Discord interaction",
        extra={"interaction_type": interaction_type},
    )
    return interaction_type, {"type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}
