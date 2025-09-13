"""Discord slash command definitions and handlers."""

from typing import Dict, List

import aiohttp
from config import ALLOWED_GUILD_IDS, DiscordResponseType
from discord_client import DiscordClient
from link_shortener import LinkShortener
from utils import (
    get_user_workspace_info,
    is_user_authorized_for_dm,
    is_user_authorized_for_guild,
)


class CommandHandler:
    """Handles Discord slash commands."""

    def __init__(self):
        self.discord_client = DiscordClient()
        self.link_shortener = LinkShortener()

    def get_command_definitions(self) -> List[Dict]:
        """Get all slash command definitions."""
        return [
            {
                "name": "api",
                "description": "Information about a random free, public API",
            },
            {
                "name": "shorten",
                "description": "Shorten a URL",
                "options": [
                    {
                        "name": "url",
                        "description": "The URL to shorten",
                        "type": 3,  # STRING
                        "required": True,
                    },
                    {
                        "name": "custom_slug",
                        "description": "Custom slug for the shortened URL (optional)",
                        "type": 3,  # STRING
                        "required": False,
                    },
                ],
            },
            {
                "name": "daily-report",
                "description": "Get your daily time tracking statistics",
            },
        ]

    def is_guild_authorized(self, guild_id: str) -> bool:
        """Check if the guild is authorized to use the bot."""
        return guild_id in ALLOWED_GUILD_IDS

    def is_user_authorized(self, discord_user_id: str, guild_id: str) -> bool:
        """Check if a Discord user is authorized to use commands in a specific guild."""
        # First check if guild is authorized
        if not self.is_guild_authorized(guild_id):
            return False

        # Then check if user is linked to a workspace with Discord integration
        return is_user_authorized_for_guild(discord_user_id, guild_id)

    def is_user_authorized_for_dm(self, discord_user_id: str) -> bool:
        """Check if a Discord user is authorized to use commands in DMs."""
        # Check if user is linked to any workspace with Discord integration
        return is_user_authorized_for_dm(discord_user_id)

    def get_user_workspace_info(self, discord_user_id: str, guild_id: str) -> dict:
        """Get workspace information for a Discord user in a specific guild."""
        return get_user_workspace_info(discord_user_id, guild_id)

    async def handle_api_command(
        self, app_id: str, interaction_token: str, user_info: dict = None
    ) -> None:
        """Handle the /api command."""
        message = await self._fetch_api_data()

        # Add user context if available
        if user_info:
            user_name = (
                user_info.get("display_name") or user_info.get("handle") or "User"
            )
            message = f"**Requested by {user_name}**\n\n{message}"

        await self.discord_client.send_response(
            {"content": message}, app_id, interaction_token
        )

    async def handle_shorten_command(
        self,
        app_id: str,
        interaction_token: str,
        options: List[Dict],
        user_info: dict = None,
    ) -> None:
        """Handle the /shorten command."""
        # Extract parameters
        url = None
        custom_slug = None

        for option in options:
            if option["name"] == "url":
                url = option["value"]
            elif option["name"] == "custom_slug":
                custom_slug = option["value"]

        # Validate required parameters
        if not url:
            await self.discord_client.send_response(
                {"content": self.discord_client.format_missing_url_message()},
                app_id,
                interaction_token,
            )
            return

        # Shorten the link with workspace context
        workspace_id = user_info.get("workspace_id") if user_info else None
        creator_id = user_info.get("platform_user_id") if user_info else None

        print(
            f"🤖: Starting link shortening for user {creator_id} in workspace {workspace_id}"
        )

        # Add timeout to link shortening operation
        import asyncio

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    self.link_shortener.shorten_link,
                    url,
                    custom_slug,
                    workspace_id,
                    creator_id,
                ),
                timeout=10.0,  # 10 second timeout
            )
            print(f"🤖: Link shortening result: {result}")
        except asyncio.TimeoutError:
            print("🤖: Link shortening timed out")
            result = {"error": "Link shortening timed out. Please try again."}
        except Exception as e:
            print(f"🤖: Error in link shortening: {e}")
            result = {"error": f"Link shortening failed: {str(e)}"}

        # Format and send response
        if result.get("success"):
            message = self.discord_client.format_success_message(result)
            # Add user context if available
            if user_info:
                user_name = (
                    user_info.get("display_name") or user_info.get("handle") or "User"
                )
                message = f"**Shortened by {user_name}**\n\n{message}"
        else:
            message = self.discord_client.format_error_message(
                result.get("error", "Unknown error occurred")
            )

        try:
            print(f"🤖: Sending response to Discord: {message[:100]}...")
            await self.discord_client.send_response(
                {"content": message}, app_id, interaction_token
            )
            print("🤖: Response sent successfully")
        except Exception as e:
            print(f"🤖: Error sending response to Discord: {e}")

    async def handle_daily_report_command(
        self, app_id: str, interaction_token: str, user_info: dict = None
    ) -> None:
        """Handle the /daily-report command."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to retrieve user information."},
                app_id,
                interaction_token,
            )
            return

        try:
            # Fetch time tracking data
            stats = await self._fetch_time_tracking_stats(user_info)
            if not stats:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Unable to fetch time tracking data."},
                    app_id,
                    interaction_token,
                )
                return

            # Format the daily report
            message = self._format_daily_report(stats, user_info)
            await self.discord_client.send_response(
                {"content": message}, app_id, interaction_token
            )
        except Exception as e:
            print(f"Error in daily report command: {e}")
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Failed to generate daily report."},
                app_id,
                interaction_token,
            )

    async def _fetch_time_tracking_stats(self, user_info: dict) -> dict:
        """Fetch time tracking statistics from the API."""
        try:
            workspace_id = user_info.get("workspace_id")
            platform_user_id = user_info.get("platform_user_id")

            if not workspace_id or not platform_user_id:
                return None

            # Get the base URL for API calls
            from utils import get_base_url

            base_url = get_base_url()

            # Fetch stats from the time tracking API
            async with aiohttp.ClientSession() as session:
                # Get today's stats
                today_url = f"{base_url}/api/v1/workspaces/{workspace_id}/time-tracking/sessions?type=stats&userId={platform_user_id}"
                async with session.get(today_url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("stats", {})
                    else:
                        print(f"Failed to fetch stats: {response.status}")
                        return None
        except Exception as e:
            print(f"Error fetching time tracking stats: {e}")
            return None

    def _format_daily_report(self, stats: dict, user_info: dict) -> str:
        """Format the daily report for Discord display."""
        from datetime import datetime, timedelta, timezone

        import pytz

        # Get GMT+7 timezone
        gmt_plus_7 = pytz.timezone("Asia/Bangkok")  # GMT+7
        now_gmt7 = datetime.now(gmt_plus_7)

        # Format times
        def format_duration(seconds: int) -> str:
            if seconds < 60:
                return f"{seconds}s"
            elif seconds < 3600:
                minutes = seconds // 60
                remaining_seconds = seconds % 60
                return f"{minutes}m {remaining_seconds}s"
            else:
                hours = seconds // 3600
                minutes = (seconds % 3600) // 60
                return f"{hours}h {minutes}m"

        # Get user display name
        user_name = user_info.get("display_name") or user_info.get("handle") or "User"

        # Extract stats
        today_time = stats.get("todayTime", 0)
        week_time = stats.get("weekTime", 0)
        month_time = stats.get("monthTime", 0)
        streak = stats.get("streak", 0)

        # Category breakdown for today
        category_breakdown = stats.get("categoryBreakdown", {})
        today_categories = category_breakdown.get("today", {})

        # Build the report
        report = f"# 📊 Daily Time Tracking Report\n\n"
        report += f"**User:** {user_name}\n"
        report += f"**Date:** {now_gmt7.strftime('%A, %B %d, %Y')} (GMT+7)\n"
        report += f"**Time:** {now_gmt7.strftime('%H:%M:%S')}\n\n"

        # Time statistics
        report += "## ⏱️ Time Statistics\n"
        report += f"**Today:** {format_duration(today_time)}\n"
        report += f"**This Week:** {format_duration(week_time)}\n"
        report += f"**This Month:** {format_duration(month_time)}\n"
        report += f"**Streak:** {streak} days\n\n"

        # Today's category breakdown
        if today_categories:
            report += "## 📋 Today's Categories\n"
            for category, time in today_categories.items():
                if time > 0:
                    report += f"• **{category}:** {format_duration(time)}\n"
            report += "\n"

        # Daily activity chart (last 7 days)
        daily_activity = stats.get("dailyActivity", [])
        if daily_activity:
            report += "## 📈 Last 7 Days Activity\n"
            # Sort by date and get last 7 days
            sorted_activity = sorted(
                daily_activity, key=lambda x: x["date"], reverse=True
            )[:7]

            for day in sorted_activity:
                date_obj = datetime.fromisoformat(day["date"])
                day_name = date_obj.strftime("%a")
                duration = format_duration(day["duration"])
                sessions = day["sessions"]

                # Create a simple bar chart
                bar_length = min(
                    20, max(1, int(day["duration"] / 3600 * 2))
                )  # 1 hour = 2 bars
                bar = "█" * bar_length + "░" * (20 - bar_length)

                report += (
                    f"**{day_name} {day['date']}:** {duration} ({sessions} sessions)\n"
                )
                report += f"`{bar}`\n"

        # Motivational message based on today's time
        if today_time == 0:
            report += "\n💡 **Tip:** Start your first time tracking session today!"
        elif today_time < 1800:  # Less than 30 minutes
            report += "\n💡 **Tip:** Great start! Keep building your productive habits."
        elif today_time < 14400:  # Less than 4 hours
            report += "\n💡 **Tip:** Good progress! You're building momentum."
        else:  # 4+ hours
            report += (
                "\n💡 **Tip:** Excellent work! You're maintaining great productivity."
            )

        return report

    async def _fetch_api_data(self) -> str:
        """Fetch random API data."""
        url = "https://www.freepublicapis.com/api/random"

        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url) as response:
                    response.raise_for_status()
                    data = await response.json()
                    message = f"# {data.get('emoji') or '🤖'} [{data['title']}]({data['source']})"
                    message += f"\n _{''.join(data['description'].splitlines())}_"
            except Exception as e:
                message = f"# 🤖: Oops! {e}"

        return message
