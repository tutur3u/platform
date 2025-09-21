"""Utilities for generating and sending Discord daily reports."""

from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

from commands import CommandHandler
from discord_client import DiscordClient

REPORT_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


class DailyReportConfigurationError(RuntimeError):
    """Raised when required configuration for the daily report is missing."""


async def trigger_daily_report(now: datetime | None = None) -> dict[str, str]:
    """Build and send the workspace daily report to the configured channel."""
    channel_id = os.getenv("DISCORD_DAILY_REPORT_CHANNEL") or os.getenv(
        "DISCORD_ANNOUNCEMENT_CHANNEL"
    )
    if not channel_id:
        raise DailyReportConfigurationError(
            "DISCORD_DAILY_REPORT_CHANNEL (or DISCORD_ANNOUNCEMENT_CHANNEL) is not set"
        )

    workspace_id = os.getenv("DISCORD_DAILY_REPORT_WORKSPACE_ID")
    if not workspace_id:
        raise DailyReportConfigurationError(
            "DISCORD_DAILY_REPORT_WORKSPACE_ID is not set"
        )

    handler = CommandHandler()
    target_time = (
        now.astimezone(REPORT_TIMEZONE) if now else datetime.now(REPORT_TIMEZONE)
    )

    aggregated, members_meta = handler._fetch_workspace_time_tracking_stats(  # noqa: SLF001
        workspace_id, target_time
    )
    if aggregated is None:
        raise RuntimeError("Workspace time tracking aggregation unavailable")

    if not aggregated:
        no_data_message = (
            "📭 No tracked time recorded today yet. Keep logging those sessions!"
        )
        await DiscordClient.send_channel_message(  # type: ignore[arg-type]
            channel_id,
            no_data_message,
            allowed_mentions={"parse": []},
        )
        return {
            "channel_id": channel_id,
            "mode": "no-data",
            "content": no_data_message,
        }

    report = handler._render_workspace_report(  # noqa: SLF001
        aggregated,
        members_meta,
        workspace_id,
        target_time,
    )
    trimmed_report = report[:1800]

    await DiscordClient.send_channel_message(  # type: ignore[arg-type]
        channel_id,
        trimmed_report,
        allowed_mentions={"parse": []},
    )

    return {
        "channel_id": channel_id,
        "workspace_id": workspace_id,
        "mode": "report",
        "content": trimmed_report,
    }
