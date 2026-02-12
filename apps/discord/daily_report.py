"""Utilities for generating and sending Discord daily reports.

This module provides functionality to generate and send workspace time tracking
reports to Discord channels. It supports:
- Weekend detection and skipping (configurable)
- Monday 3-day summary (Sat + Sun + Mon)
- Flexible report formats (summary vs detailed)
- Multi-timezone support
- Caching for improved performance

Configuration:
    DISCORD_DAILY_REPORT_CHANNEL: Target Discord channel ID
    DISCORD_DAILY_REPORT_WORKSPACE_ID: Workspace to report on
    DISCORD_DAILY_REPORT_SKIP_WEEKENDS: Skip reports on Sat/Sun (default: true)
    DISCORD_DAILY_REPORT_FORMAT: 'summary' or 'detailed' (default: summary)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum, StrEnum
from typing import Any, TypedDict, cast
from zoneinfo import ZoneInfo

from commands import CommandHandler
from discord_client import DiscordClient

# Configuration constants
REPORT_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
DEFAULT_SKIP_WEEKENDS = True
DEFAULT_REPORT_FORMAT = "summary"
WEEKEND_DAYS = (5, 6)  # Saturday=5, Sunday=6 (Monday=0)
MONDAY = 0


class ReportFormat(StrEnum):
    """Report format types."""

    SUMMARY = "summary"
    DETAILED = "detailed"


class DayOfWeek(int, Enum):
    """Day of week enumeration."""

    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


class ReportMode(StrEnum):
    """Report generation modes."""

    NO_DATA = "no-data"
    STANDARD = "standard"
    WEEKEND_SUMMARY = "weekend-summary"
    SKIPPED_WEEKEND = "skipped-weekend"


class DailyReportConfigurationError(RuntimeError):
    """Raised when required configuration for the daily report is missing."""


class DailyReportDataError(RuntimeError):
    """Raised when data fetching fails for the daily report."""


class TimeStats(TypedDict):
    """Time tracking statistics for a single user."""

    todayTime: int
    yesterdayTime: int
    weekTime: int
    monthTime: int


class WeekendStats(TypedDict):
    """Weekend-specific time tracking statistics."""

    saturdayTime: int
    sundayTime: int
    weekendTotal: int


class UserStats(TypedDict):
    """Combined user information and statistics."""

    user: dict[str, Any]
    stats: TimeStats


@dataclass
class ReportConfig:
    """Configuration for daily report generation."""

    channel_id: str
    workspace_id: str
    skip_weekends: bool = DEFAULT_SKIP_WEEKENDS
    report_format: ReportFormat = ReportFormat.SUMMARY
    timezone: ZoneInfo = REPORT_TIMEZONE

    @classmethod
    def from_environment(cls) -> ReportConfig:
        """Create configuration from environment variables.

        Returns:
            ReportConfig: Configuration object

        Raises:
            DailyReportConfigurationError: If required env vars are missing
        """
        channel_id = os.getenv("DISCORD_DAILY_REPORT_CHANNEL") or os.getenv(
            "DISCORD_ANNOUNCEMENT_CHANNEL"
        )
        if not channel_id:
            raise DailyReportConfigurationError(
                "DISCORD_DAILY_REPORT_CHANNEL (or DISCORD_ANNOUNCEMENT_CHANNEL) is not set"
            )

        workspace_id = os.getenv("DISCORD_DAILY_REPORT_WORKSPACE_ID")
        if not workspace_id:
            raise DailyReportConfigurationError("DISCORD_DAILY_REPORT_WORKSPACE_ID is not set")

        # Parse optional configuration
        skip_weekends_str = os.getenv(
            "DISCORD_DAILY_REPORT_SKIP_WEEKENDS", str(DEFAULT_SKIP_WEEKENDS)
        ).lower()
        skip_weekends = skip_weekends_str in ("true", "1", "yes")

        report_format_str = os.getenv("DISCORD_DAILY_REPORT_FORMAT", DEFAULT_REPORT_FORMAT).lower()
        try:
            report_format = ReportFormat(report_format_str)
        except ValueError:
            report_format = ReportFormat.SUMMARY

        # Parse timezone if provided
        timezone_str = os.getenv("DISCORD_DAILY_REPORT_TIMEZONE", "Asia/Ho_Chi_Minh")
        try:
            timezone = ZoneInfo(timezone_str)
        except Exception:
            timezone = REPORT_TIMEZONE

        return cls(
            channel_id=channel_id,
            workspace_id=workspace_id,
            skip_weekends=skip_weekends,
            report_format=report_format,
            timezone=timezone,
        )


def _is_weekend(date: datetime, timezone: ZoneInfo = REPORT_TIMEZONE) -> bool:
    """Check if a given date falls on a weekend.

    Args:
        date: Date to check
        timezone: Timezone for date calculation

    Returns:
        True if Saturday or Sunday, False otherwise
    """
    local_date = date.astimezone(timezone) if date.tzinfo else date.replace(tzinfo=timezone)
    return local_date.weekday() in WEEKEND_DAYS


def _is_monday(date: datetime, timezone: ZoneInfo = REPORT_TIMEZONE) -> bool:
    """Check if a given date is Monday.

    Args:
        date: Date to check
        timezone: Timezone for date calculation

    Returns:
        True if Monday, False otherwise
    """
    local_date = date.astimezone(timezone) if date.tzinfo else date.replace(tzinfo=timezone)
    return local_date.weekday() == MONDAY


def _get_weekend_dates(
    monday: datetime, timezone: ZoneInfo = REPORT_TIMEZONE
) -> tuple[datetime, datetime]:
    """Get Saturday and Sunday dates for a Monday.

    Args:
        monday: Monday date to calculate from
        timezone: Timezone for date calculation

    Returns:
        Tuple of (saturday, sunday) datetime objects at midnight
    """
    local_monday = monday.astimezone(timezone) if monday.tzinfo else monday.replace(tzinfo=timezone)
    # Normalize to midnight to avoid time component issues
    monday_midnight = local_monday.replace(hour=0, minute=0, second=0, microsecond=0)
    saturday = monday_midnight - timedelta(days=2)
    sunday = monday_midnight - timedelta(days=1)
    return saturday, sunday


def _fetch_day_stats(
    handler: CommandHandler,
    workspace_id: str,
    target_date: datetime,
) -> tuple[list[UserStats], list[dict[str, Any]]]:
    """Fetch time tracking stats for a specific day.

    Args:
        handler: CommandHandler instance
        workspace_id: Workspace ID to fetch stats for
        target_date: Date to fetch stats for

    Returns:
        Tuple of (aggregated_stats, members_metadata)

    Raises:
        DailyReportDataError: If data fetching fails
    """
    # Log the target date for debugging
    date_str = target_date.strftime("%Y-%m-%d %H:%M:%S %Z") if target_date else "None"
    print(f"📊 Fetching stats for workspace {workspace_id} on {date_str}")

    aggregated, members_meta = handler._fetch_workspace_time_tracking_stats(  # noqa: SLF001
        workspace_id, target_date
    )

    if aggregated is None:
        raise DailyReportDataError(
            f"Failed to fetch time tracking stats for workspace {workspace_id}"
        )

    # Log summary of fetched data
    total_today = sum(item["stats"].get("todayTime", 0) for item in aggregated)
    active_count = sum(1 for item in aggregated if item["stats"].get("todayTime", 0) > 0)
    print(f"   ✓ Found {active_count} active users with {total_today}s total time")

    return aggregated, members_meta


def _merge_weekend_stats(
    saturday_stats: list[UserStats],
    sunday_stats: list[UserStats],
) -> dict[str, WeekendStats]:
    """Merge Saturday and Sunday stats by user.

    Args:
        saturday_stats: Saturday aggregated stats
        sunday_stats: Sunday aggregated stats

    Returns:
        Dictionary mapping user_id to weekend stats
    """
    weekend_map: dict[str, WeekendStats] = {}

    # Process Saturday
    for item in saturday_stats:
        user_id = item["user"].get("platform_user_id")
        if user_id:
            sat_time = item["stats"].get("todayTime", 0)
            weekend_map[user_id] = {
                "saturdayTime": sat_time,
                "sundayTime": 0,
                "weekendTotal": sat_time,
            }
            if sat_time > 0:
                user_name = (
                    item["user"].get("display_name") or item["user"].get("handle") or "Unknown"
                )
                print(f"   📅 Saturday: {user_name} = {sat_time}s")

    # Add Sunday
    for item in sunday_stats:
        user_id = item["user"].get("platform_user_id")
        if user_id:
            sun_time = item["stats"].get("todayTime", 0)
            if user_id in weekend_map:
                weekend_map[user_id]["sundayTime"] = sun_time
                weekend_map[user_id]["weekendTotal"] += sun_time
            else:
                weekend_map[user_id] = {
                    "saturdayTime": 0,
                    "sundayTime": sun_time,
                    "weekendTotal": sun_time,
                }
            if sun_time > 0:
                user_name = (
                    item["user"].get("display_name") or item["user"].get("handle") or "Unknown"
                )
                print(f"   📅 Sunday: {user_name} = {sun_time}s")

    # Log weekend totals
    total_weekend = sum(stats["weekendTotal"] for stats in weekend_map.values())
    print(f"   🏖️ Weekend total across all users: {total_weekend}s")

    return weekend_map


def _render_weekend_summary_report(
    handler: CommandHandler,
    monday_stats: list[UserStats],
    weekend_map: dict[str, WeekendStats],
    members_meta: list[dict[str, Any]],
    workspace_id: str,
    target_date: datetime,
) -> str:
    """Render Monday report with weekend summary.

    Args:
        handler: CommandHandler instance
        monday_stats: Monday aggregated stats
        weekend_map: Weekend stats by user
        members_meta: Workspace members metadata
        workspace_id: Workspace ID
        target_date: Report date (Monday)

    Returns:
        Formatted report string
    """

    def fmt_dur(sec: int) -> str:
        """Format duration in seconds to human-readable string."""
        if sec < 60:
            return f"{sec}s"
        if sec < 3600:
            return f"{sec // 60}m"
        return f"{sec // 3600}h {(sec % 3600) // 60}m"

    # Calculate weekend totals
    weekend_total = sum(stats["weekendTotal"] for stats in weekend_map.values())
    weekend_active_users = sum(1 for stats in weekend_map.values() if stats["weekendTotal"] > 0)

    # Calculate Monday totals
    monday_total = sum(item["stats"].get("todayTime", 0) for item in monday_stats)
    monday_active_users = sum(1 for item in monday_stats if item["stats"].get("todayTime", 0) > 0)

    # Calculate week and month from Monday stats
    total_week = sum(item["stats"].get("weekTime", 0) for item in monday_stats)
    total_month = sum(item["stats"].get("monthTime", 0) for item in monday_stats)

    date_str = target_date.strftime("%B %d, %Y")

    header = f"""# 📊 **Weekend + Monday Report** - {date_str}

**🏖️ Weekend Summary (Sat-Sun)**
Total: **{fmt_dur(weekend_total)}** | 👥 Active: **{weekend_active_users}** of \
**{len(members_meta)}**

**📈 Today (Monday)**
🌅 Today: **{fmt_dur(monday_total)}** | 👥 Active: **{monday_active_users}** of \
**{len(members_meta)}**

**📊 Cumulative Totals**
📅 Weekly: **{fmt_dur(total_week)}** | 📆 Monthly: **{fmt_dur(total_month)}**

## 🏆 **Top Contributors (3-day period)**"""

    # Merge weekend and Monday stats for ranking
    combined_stats: dict[str, dict[str, Any]] = {}

    for item in monday_stats:
        user_id = item["user"].get("platform_user_id")
        if user_id:
            user_weekend_data: WeekendStats | dict[str, Any] = weekend_map.get(user_id, {})
            weekend_time = (
                user_weekend_data.get("weekendTotal", 0)
                if isinstance(user_weekend_data, dict)
                else 0
            )
            monday_time = item["stats"].get("todayTime", 0)
            combined_stats[user_id] = {
                "user": item["user"],
                "weekend_time": weekend_time,
                "monday_time": monday_time,
                "total_time": weekend_time + monday_time,
                "week_time": item["stats"].get("weekTime", 0),
                "month_time": item["stats"].get("monthTime", 0),
            }

    # Sort by 3-day total
    ranked_users = sorted(combined_stats.values(), key=lambda x: x["total_time"], reverse=True)

    def get_medal(rank: int) -> str:
        medals = {1: "🥇", 2: "🥈", 3: "🥉"}
        return medals.get(rank, f"**{rank}.**")

    discord_map = handler._get_discord_user_map(workspace_id)  # noqa: SLF001

    lines = []
    top_limit = 10
    for idx, user_data in enumerate(ranked_users[:top_limit], start=1):
        user = user_data["user"]
        puid = user.get("platform_user_id")
        display_name = user.get("display_name") or user.get("handle") or "User"

        medal = get_medal(idx)

        # Format user with display name and mention
        if puid in discord_map:
            user_display = f"**{display_name}** (<@{discord_map[puid]}>)"
        else:
            user_display = f"**{display_name}**"

        lines.append(f"{medal} {user_display}")
        lines.append(f"    🏖️ **Weekend:** {fmt_dur(user_data['weekend_time'])}")
        lines.append(f"    🌅 **Monday:** {fmt_dur(user_data['monday_time'])}")
        lines.append(f"    📊 **3-day Total:** {fmt_dur(user_data['total_time'])}")
        lines.append("")

    if len(ranked_users) > top_limit:
        lines.append(f"*... and {len(ranked_users) - top_limit} more contributors*")

    # Footer
    now = datetime.now(REPORT_TIMEZONE)
    footer = f"\n*📅 Generated: {now.strftime('%B %d, %Y at %H:%M')} (GMT+7)*"

    return header + "\n" + "\n".join(lines) + footer


async def trigger_daily_report(now: datetime | None = None) -> dict[str, str]:
    """Build and send the workspace daily report to the configured channel.

    This function handles:
    - Configuration validation
    - Weekend detection and skipping (if enabled)
    - Monday 3-day summary generation
    - Standard daily report generation
    - Discord message sending

    Args:
        now: Optional datetime for report generation (defaults to current time)

    Returns:
        Dictionary containing:
            - channel_id: Discord channel ID where report was sent
            - mode: Report mode (no-data, standard, weekend-summary, skipped-weekend)
            - content: Report content that was sent
            - workspace_id: (optional) Workspace ID if report was generated

    Raises:
        DailyReportConfigurationError: If required configuration is missing
        DailyReportDataError: If data fetching fails
    """
    # Load configuration
    config = ReportConfig.from_environment()

    target_time = now.astimezone(config.timezone) if now else datetime.now(config.timezone)

    # Check if weekend and skip if configured
    if config.skip_weekends and _is_weekend(target_time, config.timezone):
        skip_message = "🏖️ Weekend detected - daily report skipped. See you Monday!"
        print(f"Skipping report for weekend: {target_time.strftime('%A, %B %d, %Y')}")
        return {
            "channel_id": config.channel_id,
            "mode": ReportMode.SKIPPED_WEEKEND.value,
            "content": skip_message,
            "skipped": "true",
        }

    # Initialize handler for data fetching
    handler = CommandHandler()

    # Check if Monday for 3-day summary
    if _is_monday(target_time, config.timezone):
        try:
            # Fetch Saturday, Sunday, and Monday stats
            saturday, sunday = _get_weekend_dates(target_time, config.timezone)

            saturday_stats, _ = _fetch_day_stats(handler, config.workspace_id, saturday)
            sunday_stats, _ = _fetch_day_stats(handler, config.workspace_id, sunday)
            monday_stats, members_meta = _fetch_day_stats(handler, config.workspace_id, target_time)

            # Check if we have any data across all 3 days
            has_data = (
                any(item["stats"].get("todayTime", 0) > 0 for item in saturday_stats)
                or any(item["stats"].get("todayTime", 0) > 0 for item in sunday_stats)
                or any(item["stats"].get("todayTime", 0) > 0 for item in monday_stats)
            )

            if not has_data:
                no_data_message = (
                    "📭 No tracked time recorded this weekend or today. "
                    "Keep logging those sessions!"
                )
                await DiscordClient.send_channel_message(
                    config.channel_id,
                    no_data_message,
                    allowed_mentions={"parse": []},
                )
                return {
                    "channel_id": config.channel_id,
                    "workspace_id": config.workspace_id,
                    "mode": ReportMode.NO_DATA.value,
                    "content": no_data_message,
                }

            # Merge weekend stats
            weekend_map = _merge_weekend_stats(saturday_stats, sunday_stats)

            # Render 3-day summary report
            report = _render_weekend_summary_report(
                handler,
                monday_stats,
                weekend_map,
                members_meta,
                config.workspace_id,
                target_time,
            )
            trimmed_report = report[:1800]

            await DiscordClient.send_channel_message(
                config.channel_id,
                trimmed_report,
                allowed_mentions={"parse": []},
            )

            return {
                "channel_id": config.channel_id,
                "workspace_id": config.workspace_id,
                "mode": ReportMode.WEEKEND_SUMMARY.value,
                "content": trimmed_report,
            }
        except DailyReportDataError as e:
            # Fall back to standard report if weekend data fetch fails
            print(f"Weekend summary failed, falling back to standard: {e}")
            # Continue to standard report generation below

    # Standard daily report (Tue-Fri or Monday fallback)
    aggregated, members_meta = _fetch_day_stats(handler, config.workspace_id, target_time)

    if not aggregated or not any(item["stats"].get("todayTime", 0) > 0 for item in aggregated):
        no_data_message = "📭 No tracked time recorded today yet. Keep logging those sessions!"
        await DiscordClient.send_channel_message(
            config.channel_id,
            no_data_message,
            allowed_mentions={"parse": []},
        )
        return {
            "channel_id": config.channel_id,
            "workspace_id": config.workspace_id,
            "mode": ReportMode.NO_DATA.value,
            "content": no_data_message,
        }

    report = handler._render_workspace_report(  # noqa: SLF001
        cast(list[dict[Any, Any]], aggregated),
        members_meta,
        config.workspace_id,
        target_time,
    )
    trimmed_report = report[:1800]

    await DiscordClient.send_channel_message(
        config.channel_id,
        trimmed_report,
        allowed_mentions={"parse": []},
    )

    return {
        "channel_id": config.channel_id,
        "workspace_id": config.workspace_id,
        "mode": ReportMode.STANDARD.value,
        "content": trimmed_report,
    }
