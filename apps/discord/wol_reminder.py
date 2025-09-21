"""Helpers for the WOL reminder workflow."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from discord_client import (
    DiscordAPIError,
    DiscordClient,
    DiscordMissingAccessError,
    DiscordMissingPermissionsError,
)

WOL_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
WOL_CUTOFF_DISPLAY = "10:00 AM (GMT+7)"


def build_wol_reminder_message(now: datetime | None = None) -> str:
    """Render the reminder copy with the correct next-day context."""
    current = now.astimezone(WOL_TIMEZONE) if now else datetime.now(WOL_TIMEZONE)
    tomorrow = (current + timedelta(days=1)).astimezone(WOL_TIMEZONE)
    formatted_date = tomorrow.strftime("%A, %d %B %Y")
    return (
        "@everyone 🌅 **Tomorrow's Focus Pulse**\n"
        f"Share your top priorities for **{formatted_date}** before {WOL_CUTOFF_DISPLAY}.\n"
        "✨ Let the crew know: what you're shipping, what support you need, and any early blockers.\n"
        "Let's keep our WOL rhythm bright and land tomorrow with confidence! 🚀"
    )


async def trigger_wol_reminder(now: datetime | None = None) -> dict[str, str]:
    """Send the reminder message to the announcement channel."""
    channel_id = os.getenv("DISCORD_ANNOUNCEMENT_CHANNEL")
    if not channel_id:
        raise RuntimeError("DISCORD_ANNOUNCEMENT_CHANNEL environment variable is not set")

    message = build_wol_reminder_message(now)
    try:
        await DiscordClient.send_channel_message(
            channel_id,
            message,
            allowed_mentions={"parse": ["everyone"]},
        )
        return {"channel_id": channel_id, "content": message, "mode": "everyone"}
    except DiscordMissingPermissionsError:
        # Fallback: resend without pinging @everyone to avoid silent failures.
        fallback_mentions = {"parse": []}
        await DiscordClient.send_channel_message(
            channel_id,
            message,
            allowed_mentions=fallback_mentions,
        )
        return {
            "channel_id": channel_id,
            "content": message,
            "mode": "no-mention",
        }
    except (DiscordMissingAccessError, DiscordAPIError):
        # Re-raise for upstream handlers to surface detailed error messaging.
        raise
