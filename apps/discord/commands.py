"""Discord slash command definitions and handlers."""

import asyncio
import contextlib
import datetime
import re
from datetime import datetime as dt
from typing import Any
from zoneinfo import ZoneInfo

import aiohttp
import pytz

from config import ALLOWED_GUILD_IDS, DiscordResponseType
from discord_client import (
    DiscordAPIError,
    DiscordClient,
    DiscordMissingAccessError,
)
from link_shortener import LinkShortener
from utils import (
    get_base_url,
    get_supabase_client,
    get_user_workspace_info,
    is_user_authorized_for_dm,
    is_user_authorized_for_guild,
)
from wol_reminder import trigger_wol_reminder


class CommandHandler:
    """Handles Discord slash commands."""

    def __init__(self):
        self.discord_client = DiscordClient()
        self.link_shortener = LinkShortener()

    def get_command_definitions(self) -> list[dict]:
        """Get all slash command definitions."""
        return [
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
                "options": [
                    {
                        "name": "date",
                        "description": (
                            "Specific date (DD-MM-YYYY, DD/MM/YYYY, or DD/MM/YY format, optional)"
                        ),
                        "type": 3,  # STRING
                        "required": False,
                    }
                ],
            },
            {
                "name": "tumeet",
                "description": "Create a new Tuturuuu Meet plan",
                "options": [
                    {
                        "name": "name",
                        "description": "Plan title (e.g. Sprint Planning)",
                        "type": 3,  # STRING
                        "required": True,
                    }
                ],
            },
            {
                "name": "ticket",
                "description": "Create a new task ticket using interactive selection",
                "options": [],
            },
            {
                "name": "assign",
                "description": "Assign users to a task by Discord mention",
                "options": [
                    {
                        "name": "task_id",
                        "description": "Task ID (UUID) to assign users to",
                        "type": 3,  # STRING
                        "required": True,
                    },
                    {
                        "name": "users",
                        "description": "Space or comma separated list of Discord @mentions",
                        "type": 3,  # STRING
                        "required": True,
                    },
                ],
            },
            {
                "name": "unassign",
                "description": "Remove assignees from a task by Discord mention",
                "options": [
                    {
                        "name": "task_id",
                        "description": "Task ID (UUID) to unassign users from",
                        "type": 3,  # STRING
                        "required": True,
                    },
                    {
                        "name": "users",
                        "description": "Space or comma separated list of Discord @mentions",
                        "type": 3,  # STRING
                        "required": True,
                    },
                ],
            },
            {
                "name": "assignees",
                "description": "List current assignees for a task",
                "options": [
                    {
                        "name": "task_id",
                        "description": "Task ID (UUID) to list assignees for",
                        "type": 3,  # STRING
                        "required": True,
                    },
                ],
            },
            {
                "name": "wol-reminder",
                "description": "Send the daily WOL priorities reminder to the announcement channel",
                "options": [],
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

    def get_user_workspace_info(self, discord_user_id: str, guild_id: str) -> dict | None:
        """Get workspace information for a Discord user in a specific guild."""
        return get_user_workspace_info(discord_user_id, guild_id)

    async def handle_shorten_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict],
        user_info: dict | None = None,
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

        print(f"🤖: Starting link shortening for user {creator_id} in workspace {workspace_id}")

        # Add timeout to link shortening operation
        try:
            # If workspace_id is None, don't pass it (use default from function)
            if workspace_id is not None:
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
            else:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.link_shortener.shorten_link,
                        url,
                        custom_slug,
                        creator_id=creator_id,
                    ),
                    timeout=10.0,  # 10 second timeout
                )
            print(f"🤖: Link shortening result: {result}")
        except TimeoutError:
            print("🤖: Link shortening timed out")
            result = {"error": "Link shortening timed out. Please try again."}
        except Exception as e:
            print(f"🤖: Error in link shortening: {e}")
            result = {"error": f"Link shortening failed: {e!s}"}

        # Format and send response
        if result.get("success"):
            message = self.discord_client.format_success_message(result)
            # Add user context if available
            if user_info:
                user_name = user_info.get("display_name") or user_info.get("handle") or "User"
                message = f"**Shortened by {user_name}**\n\n{message}"
        else:
            message = self.discord_client.format_error_message(
                result.get("error", "Unknown error occurred")
            )

        try:
            print(f"🤖: Sending response to Discord: {message[:100]}...")
            await self.discord_client.send_response({"content": message}, app_id, interaction_token)
            print("🤖: Response sent successfully")
        except Exception as e:
            print(f"🤖: Error sending response to Discord: {e}")

    async def handle_daily_report_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict] | None = None,
        user_info: dict | None = None,
    ) -> None:
        """Handle the /daily-report command (workspace summary).

        Now aggregates stats for all users in the linked workspace (Discord integration),
        similar to the management dashboard summary:
          - Per-user today/week/month durations
          - Totals and active users count
          - Top contributors today
        Falls back gracefully on rate limit or partial failures.
        """
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to retrieve user information."},
                app_id,
                interaction_token,
            )
            return

        try:
            # Parse date option if provided
            target_date = None
            if options:
                for option in options:
                    if option["name"] == "date":
                        date_str = option.get("value", "").strip()
                        if date_str:
                            try:
                                # Try multiple date formats
                                for date_format in ["%d-%m-%Y", "%d/%m/%Y", "%d/%m/%y"]:
                                    try:
                                        target_date = dt.strptime(date_str, date_format)
                                        # If 2-digit year, assume 20xx
                                        if target_date.year < 100:
                                            target_date = target_date.replace(
                                                year=target_date.year + 2000
                                            )
                                        break
                                    except ValueError:
                                        continue
                                else:
                                    # None of the formats worked
                                    raise ValueError("No valid format found")
                            except ValueError:
                                await self.discord_client.send_response(
                                    {
                                        "content": (
                                            "❌ **Error:** Invalid date format. "
                                            "Please use DD-MM-YYYY, DD/MM/YYYY, or DD/MM/YY "
                                            "(e.g., 14-09-2025, 14/09/2025, 14/9/25)."
                                        )
                                    },
                                    app_id,
                                    interaction_token,
                                )
                                return

            workspace_id = user_info.get("workspace_id")
            if not workspace_id:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Missing workspace context."},
                    app_id,
                    interaction_token,
                )
                return

            # Direct DB aggregation only (no per-user HTTP fallback to avoid rate limiting)
            aggregated, members_meta = self._fetch_workspace_time_tracking_stats(
                workspace_id, target_date
            )
            if aggregated is None:
                await self.discord_client.send_response(
                    {
                        "content": (
                            "❌ **Error:** Workspace time tracking aggregation "
                            "unavailable (schema mismatch)."
                        )
                    },
                    app_id,
                    interaction_token,
                )
                return
            if not aggregated:
                await self.discord_client.send_response(
                    {"content": "📭 No tracked time today for any members yet."},
                    app_id,
                    interaction_token,
                )
                return

            message = self._render_workspace_report(
                aggregated, members_meta, workspace_id, target_date
            )

            await self.discord_client.send_response(
                {"content": message[:1800]},  # keep under Discord limits with buffer
                app_id,
                interaction_token,
            )
        except Exception as e:
            print(f"Error in daily report command: {e}")
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Failed to generate daily report."},
                app_id,
                interaction_token,
            )

    async def handle_tumeet_plan_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict[str, Any]],
        user_info: dict | None = None,
    ) -> None:
        """Handle the /tumeet command to create a meet together plan.

        Simplified version: user only supplies the plan *name*.
        All other fields use defaults and can be edited later on the website:
          - date: today (Asia/Bangkok, GMT+7)
          - start_time: 07:00:00+07:00
          - end_time:   22:00:00+07:00
          - is_public: true
        """
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        # Extract only the required name option
        raw: dict[str, str | None] = {opt["name"]: opt.get("value") for opt in options}
        plan_name = (raw.get("name") or "").strip()
        if not plan_name:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Plan name is required."},
                app_id,
                interaction_token,
            )
            return

        tz = pytz.timezone("Asia/Bangkok")  # GMT+7
        today_str = dt.now(tz).strftime("%Y-%m-%d")

        # Defaults (timezone-aware strings)
        date_str = today_str
        start_time = "07:00:00+07:00"
        end_time = "22:00:00+07:00"
        is_public = True

        # Prepare Supabase insert
        # dates column appears to store array of date strings
        workspace_id = user_info.get("workspace_id")
        creator_id = user_info.get("platform_user_id")
        if not workspace_id or not creator_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        # Build payload matching API route behavior
        payload = {
            "name": plan_name,
            "dates": [date_str],
            "is_public": is_public,
            "start_time": start_time,
            "end_time": end_time,
        }

        # Insert directly via service role (Python Supabase client)
        try:
            supabase = get_supabase_client()
            insert_payload = {
                **payload,
                "creator_id": creator_id,
                "ws_id": workspace_id,
            }
            result = supabase.table("meet_together_plans").insert(insert_payload).execute()
            if not result.data:
                raise Exception("Empty insert result")
            # Supabase python client returns list of rows inserted if returning
            # is enabled by default
            plan_id = result.data[0].get("id")
            if not plan_id:
                raise Exception("Missing plan id in response")
        except Exception as e:
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to create plan ({e})."},
                app_id,
                interaction_token,
            )
            return

        # Construct share URL (tumeet.me/{id})
        share_url = f"https://tumeet.me/{plan_id}"
        user_name = user_info.get("display_name") or user_info.get("handle") or "User"
        message = (
            f"✅ **Tuturuuu Meet plan created by {user_name}!**\n\n"
            f"**Name:** {plan_name}\n"
            f"**Date:** {date_str} 07:00-22:00 (GMT+7)\n"
            f"**Public:** Yes (default)\n"
            f"**Link:** {share_url.replace('-', '')}\n\n"
            f"_Defaults applied. Edit details & times on the website if needed._"
        )

        await self.discord_client.send_response({"content": message}, app_id, interaction_token)

    async def handle_wol_reminder_command(
        self,
        app_id: str,
        interaction_token: str,
        user_info: dict | None = None,
    ) -> None:
        """Handle the /wol-reminder command."""
        try:
            result = await trigger_wol_reminder()
        except DiscordMissingAccessError as error:
            await self.discord_client.send_response(
                {
                    "content": (
                        "❌ **Error:** The bot cannot access the configured announcement channel.\n"
                        "Please confirm `DISCORD_ANNOUNCEMENT_CHANNEL` points to a text channel "
                        "where the bot has **View Channel** and **Send Messages** permissions."
                    )
                },
                app_id,
                interaction_token,
            )
            print(f"WOL reminder missing access: {error}")
            return
        except DiscordAPIError as error:
            print(f"Error sending WOL reminder: {error}")
            await self.discord_client.send_response(
                {
                    "content": (
                        "❌ **Error:** Unable to send the reminder. "
                        "Please try again or check the cron endpoint logs."
                    )
                },
                app_id,
                interaction_token,
            )
            return

        channel_mention = f"<#{result['channel_id']}>"
        requester = None
        if user_info:
            requester = user_info.get("display_name") or user_info.get("handle")

        prefix = "✅ Reminder sent."
        if requester:
            prefix = f"✅ Reminder triggered by {requester}."

        suffix = ""
        if result.get("mode") == "no-mention":
            suffix = (
                "\n⚠️ Bot lacks permission to ping @everyone in that channel, "
                "so the notification omitted the mention."
            )

        await self.discord_client.send_response(
            {"content": (f"{prefix}\nMessage delivered in {channel_mention}.{suffix}")},
            app_id,
            interaction_token,
        )

    async def handle_ticket_command(
        self,
        app_id: str,
        interaction_token: str,
        user_info: dict | None = None,
    ) -> None:
        """Handle the /ticket command with interactive board selection."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Fetch boards for interactive selection
            boards_result = (
                supabase.table("workspace_boards")
                .select("id, name, created_at")
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .order("created_at")
                .execute()
            )

            if not boards_result.data:
                await self.discord_client.send_response(
                    {
                        "content": (
                            "📋 **No task boards found** in your workspace.\n\n"
                            "_Create boards on the web dashboard first._"
                        )
                    },
                    app_id,
                    interaction_token,
                )
                return

            # Create interactive board selection
            user_name = user_info.get("display_name") or user_info.get("handle") or "User"
            components = self.discord_client.create_board_selection_components(boards_result.data)

            # Update the custom_id to indicate this is for ticket creation
            if components and components[0].get("components"):
                components[0]["components"][0]["custom_id"] = "select_board_for_ticket"

            payload = {
                "content": (
                    f"🎫 **Create a Task Ticket - Step 1/2**\n\n"
                    f"**Hi {user_name}!** Choose a board to create your ticket in:"
                ),
                "components": components,
            }

            await self.discord_client.send_response_with_components(
                payload, app_id, interaction_token
            )

        except Exception as e:
            print(f"Error in ticket command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to load boards: {e!s}"},
                app_id,
                interaction_token,
            )

    async def handle_boards_command(
        self,
        app_id: str,
        interaction_token: str,
        user_info: dict | None = None,
    ) -> None:
        """Handle the /boards command to list available task boards."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Fetch all boards in the workspace
            boards_result = (
                supabase.table("workspace_boards")
                .select("id, name, created_at")
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .order("created_at")
                .execute()
            )

            if not boards_result.data:
                await self.discord_client.send_response(
                    {
                        "content": (
                            "📋 **No task boards found** in your workspace.\\n\\n"
                            "_You can create boards on the web dashboard._"
                        )
                    },
                    app_id,
                    interaction_token,
                )
                return

            # Create interactive board selection
            user_name = user_info.get("display_name") or user_info.get("handle") or "User"
            components = self.discord_client.create_board_selection_components(boards_result.data)

            payload = {
                "content": (
                    f"📋 **Task Boards for {user_name}**\n\nSelect a board to see its task lists:"
                ),
                "components": components,
            }

            await self.discord_client.send_response_with_components(
                payload, app_id, interaction_token
            )

        except Exception as e:
            print(f"Error in boards command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to fetch boards: {e!s}"},
                app_id,
                interaction_token,
            )

    async def handle_lists_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict[str, Any]],
        user_info: dict | None = None,
    ) -> None:
        """Handle the /lists command to list task lists in a board."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        # Extract board_id from options
        raw: dict[str, Any] = {opt["name"]: opt.get("value") for opt in options}
        board_id = str(raw.get("board_id") or "").strip()

        if not board_id:
            await self.discord_client.send_response(
                {
                    "content": (
                        "❌ **Error:** Board ID is required. Use `/boards` to see available boards."
                    )
                },
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Validate board exists and belongs to workspace
            board_result = (
                supabase.table("workspace_boards")
                .select("id, name")
                .eq("id", board_id)
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .execute()
            )
            if not board_result.data:
                await self.discord_client.send_response(
                    {"content": f"❌ **Error:** Board '{board_id}' not found in your workspace."},
                    app_id,
                    interaction_token,
                )
                return

            board = board_result.data[0]
            board_name = board.get("name", "Unknown Board")

            # Fetch task lists in the board
            lists_result = (
                supabase.table("task_lists")
                .select("id, name, status, created_at")
                .eq("board_id", board_id)
                .eq("deleted", False)
                .order("position")
                .order("created_at")
                .execute()
            )

            if not lists_result.data:
                await self.discord_client.send_response(
                    {
                        "content": (
                            f"📝 **No task lists found** in board '{board_name}'.\\n\\n"
                            "_You can create lists on the web dashboard._"
                        )
                    },
                    app_id,
                    interaction_token,
                )
                return

            # Format the lists
            message = f"📝 **Task Lists in '{board_name}'**\n\n"

            status_emojis = {
                "not_started": "⚪",
                "active": "🟢",
                "done": "✅",
                "closed": "🔴",
            }

            for idx, task_list in enumerate(lists_result.data[:15], 1):  # Limit to 15 lists
                list_id = task_list.get("id")
                list_name = task_list.get("name", "Unnamed List")
                status = task_list.get("status", "not_started")
                emoji = status_emojis.get(status, "⚪")
                message += f"**{idx}.** {emoji} {list_name}\n`ID: {list_id}`\n\n"

            if len(lists_result.data) > 15:
                message += f"_... and {len(lists_result.data) - 15} more lists_\n\n"

            message += f'_Use `/ticket {board_id} <list_id> "Task Title"` to create a task._'

            await self.discord_client.send_response({"content": message}, app_id, interaction_token)

        except Exception as e:
            print(f"Error in lists command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to fetch lists: {e!s}"},
                app_id,
                interaction_token,
            )

    async def handle_board_selection_interaction(
        self, app_id: str, interaction_token: str, board_id: str, user_info: dict | None = None
    ) -> None:
        """Handle board selection from select menu."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Validate board exists and belongs to workspace
            board_result = (
                supabase.table("workspace_boards")
                .select("id, name")
                .eq("id", board_id)
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .execute()
            )
            if not board_result.data:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Board not found in your workspace."},
                    app_id,
                    interaction_token,
                )
                return

            board = board_result.data[0]
            board_name = board.get("name", "Unknown Board")

            # Fetch task lists in the board
            lists_result = (
                supabase.table("task_lists")
                .select("id, name, status, created_at")
                .eq("board_id", board_id)
                .eq("deleted", False)
                .order("position")
                .order("created_at")
                .execute()
            )

            if not lists_result.data:
                await self.discord_client.send_response(
                    {
                        "content": (
                            f"📝 **No task lists found** in board '{board_name}'.\n\n"
                            "_Create lists on the web dashboard first._"
                        )
                    },
                    app_id,
                    interaction_token,
                )
                return

            # Create interactive list selection
            components = self.discord_client.create_list_selection_components(
                lists_result.data, board_id
            )
            content = (
                f"🎫 **Create Ticket - Step 2/2**\n\n**Board:** {board_name}\n\n"
                "Choose a list to create your ticket in:"
            )

            payload = {"content": content, "components": components}

            await self.discord_client.send_response_with_components(
                payload, app_id, interaction_token
            )

        except Exception as e:
            print(f"Error in board selection: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to load lists: {e!s}"},
                app_id,
                interaction_token,
            )

    async def handle_list_selection_interaction(
        self,
        app_id: str,
        interaction_token: str,
        _board_id: str,
        list_id: str,
        user_info: dict | None = None,
    ) -> None:
        """Handle list selection - show ticket creation modal."""
        if not user_info:
            # This should not happen in normal flow, but handle gracefully
            return

        try:
            supabase = get_supabase_client()

            # Get list information with board details
            list_result = (
                supabase.table("task_lists")
                .select("id, name, board_id, workspace_boards!inner(id, name)")
                .eq("id", list_id)
                .eq("deleted", False)
                .execute()
            )

            if not list_result.data:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** List not found."},
                    app_id,
                    interaction_token,
                )
                return

            list_data = list_result.data[0]
            list_name = list_data.get("name", "Unknown List")
            actual_board_id = list_data.get("board_id")
            board_name = list_data.get("workspace_boards", {}).get("name", "Unknown Board")

            if not actual_board_id:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Board information not found."},
                    app_id,
                    interaction_token,
                )
                return

            # This method is no longer used for modal creation
            # Modal creation is now handled synchronously in the main interaction handler
            await self.discord_client.send_response(
                {"content": f"✅ Selected list: **{list_name}** in board **{board_name}**"},
                app_id,
                interaction_token,
            )

        except Exception as e:
            print(f"Error in list selection: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to prepare ticket form: {e!s}"},
                app_id,
                interaction_token,
            )

    async def handle_ticket_modal_submission(
        self,
        app_id: str,
        interaction_token: str,
        board_id: str,
        list_id: str,
        form_data: dict[str, str],
        user_info: dict | None = None,
    ) -> None:
        """Handle ticket form modal submission."""
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        creator_id = user_info.get("platform_user_id")
        if not workspace_id or not creator_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Extract form data
            title = form_data.get("ticket_title", "").strip()
            description = form_data.get("ticket_description", "").strip() or None
            priority_raw = form_data.get("ticket_priority", "2").strip()

            # ---- Priority Mapping (Legacy numeric -> New enum) ----
            # Database migration history:
            #   Original schema stored a smallint priority (1..4).
            #   Later migrations introduced enum task_priority
            #   ('low','normal','high','critical') and finally replaced the numeric
            #   column with the enum (renaming user_defined_priority -> priority).
            #   Legacy UI / Discord modal still sends numeric values 1..4
            #   representing severity from lowest to highest.
            #   We preserve user-facing labels (Low, Medium, High, Urgent)
            #   while storing the canonical enum.
            # Mapping we apply here (ascending severity):
            #   1 -> 'low'
            #   2 -> 'normal'   (displayed as Medium)
            #   3 -> 'high'
            #   4 -> 'critical' (displayed as Urgent)
            # We also accept historical textual inputs ('urgent','medium') just in case.

            def normalize_priority(value: str) -> str:
                value_lc = value.lower().strip()
                # Accept direct enum values
                if value_lc in {"low", "normal", "high", "critical"}:
                    return value_lc
                # Accept legacy textual synonyms
                synonyms = {
                    "medium": "normal",
                    "urgent": "critical",
                }
                if value_lc in synonyms:
                    return synonyms[value_lc]
                # Numeric mapping fallback
                try:
                    num = int(value_lc)
                except ValueError:
                    num = 2  # default medium/normal
                num = max(1, min(4, num))
                numeric_map = {1: "low", 2: "normal", 3: "high", 4: "critical"}
                return numeric_map.get(num, "normal")

            priority_enum = normalize_priority(priority_raw)

            if not title:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Task title is required."},
                    app_id,
                    interaction_token,
                )
                return

            # Validate board and list still exist
            board_result = (
                supabase.table("workspace_boards")
                .select("id, name")
                .eq("id", board_id)
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .execute()
            )
            if not board_result.data:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Board not found or access denied."},
                    app_id,
                    interaction_token,
                )
                return

            list_result = (
                supabase.table("task_lists")
                .select("id, name")
                .eq("id", list_id)
                .eq("board_id", board_id)
                .eq("deleted", False)
                .execute()
            )
            if not list_result.data:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** List not found or access denied."},
                    app_id,
                    interaction_token,
                )
                return

            board_name = board_result.data[0].get("name", "Unknown Board")
            list_name = list_result.data[0].get("name", "Unknown List")

            # Create the task
            task_payload = {
                "name": title,
                "description": description,
                "list_id": list_id,
                # Store enum value expected by DB
                "priority": priority_enum,
                "creator_id": creator_id,
                "deleted": False,
                "completed": False,
                "archived": False,
            }

            task_result = supabase.table("tasks").insert(task_payload).execute()
            if not task_result.data:
                raise Exception("Failed to create task - empty result")

            task_id = task_result.data[0].get("id")
            if not task_id:
                raise Exception("Missing task ID in response")

            # Format success message
            user_name = user_info.get("display_name") or user_info.get("handle") or "User"
            # Display labels aligned with original numeric UI
            # while DB keeps canonical enums
            display_labels = {
                "low": "Low 🐢",
                "normal": "Medium 🐰",
                "high": "High 🐴",
                "critical": "Urgent 🦄",
            }
            priority_name = display_labels.get(priority_enum, "Medium")

            message = (
                f"🎫 **Task ticket created by {user_name}!**\n\n"
                f"**Title:** {title}\n"
                f"**Board:** {board_name}\n"
                f"**List:** {list_name}\n"
                f"**Priority:** {priority_name}\n"
            )

            if description:
                # Truncate description if too long
                desc_display = description[:100] + "..." if len(description) > 100 else description
                message += f"**Description:**\n{desc_display}\n\n"

            message += f"**Task ID:** `{task_id}`\n"
            message += f"**Link:** https://tuturuuu.com/{workspace_id}/tasks/boards/{board_id}\n\n"
            message += "_Task created successfully! View it in your workspace dashboard._"

            await self.discord_client.send_response({"content": message}, app_id, interaction_token)

        except Exception as e:
            print(f"Error creating ticket: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to create task ticket: {e!s}"},
                app_id,
                interaction_token,
            )

    def _validate_assign_inputs(
        self, options: list[dict[str, Any]], user_info: dict | None
    ) -> tuple[str | None, str, str, list[str], str]:
        """Validate inputs for assign/unassign commands.

        Returns (error_msg, task_id, users_raw, mentioned_ids, workspace_id).
        If error_msg is not None, validation failed.
        """
        if not user_info:
            return ("❌ **Error:** Unable to identify user/workspace.", "", "", [], "")

        raw: dict[str, Any] = {opt["name"]: opt.get("value") for opt in options}
        task_id = str(raw.get("task_id") or "").strip()
        users_raw = str(raw.get("users") or "").strip()

        if not task_id:
            return ("❌ **Error:** task_id is required.", task_id, users_raw, [], "")
        if not users_raw:
            return ("❌ **Error:** At least one @mention is required.", task_id, users_raw, [], "")

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            return ("❌ **Error:** Missing workspace context.", task_id, users_raw, [], "")

        # Parse mentions: Discord mentions come as <@1234567890> or <@!1234567890>
        mention_pattern = re.compile(r"<@!?([0-9]+)>")
        mentioned_ids = mention_pattern.findall(users_raw)
        if not mentioned_ids:
            return (
                "❌ **Error:** No valid @mentions found. "
                "Use Discord autocomplete to mention users.",
                task_id,
                users_raw,
                [],
                workspace_id,
            )

        return (None, task_id, users_raw, mentioned_ids, workspace_id)

    async def _validate_task_and_get_users(
        self,
        supabase,
        task_id: str,
        workspace_id: str,
        mentioned_ids: list[str],
    ) -> tuple[str | None, list[str], dict]:
        """Validate task and get valid user IDs.

        Returns (error_msg, valid_user_ids, member_rows_data).
        If error_msg is not None, validation failed.
        """
        # Validate task and derive workspace via joins
        task_result = (
            supabase.table("tasks")
            .select(
                "id, list_id, task_lists!inner(id, board_id, workspace_boards!inner(id, ws_id))"
            )
            .eq("id", task_id)
            .eq("deleted", False)
            .execute()
        )
        if not task_result.data:
            return ("❌ **Error:** Task not found or deleted.", [], {})

        task_row = task_result.data[0]
        # Extract ws_id safely
        ws_via_task = ((task_row.get("task_lists") or {}).get("workspace_boards") or {}).get(
            "ws_id"
        )
        if not ws_via_task or ws_via_task != workspace_id:
            return ("❌ **Error:** Task does not belong to your workspace.", [], {})

        # Map discord_user_ids -> platform_user_ids in same workspace
        member_rows = (
            supabase.table("discord_guild_members")
            .select("discord_user_id, platform_user_id, discord_guild_id")
            .in_("discord_user_id", mentioned_ids)
            .execute()
        )

        if not member_rows.data:
            return (
                "❌ **Error:** None of the mentioned users are linked to any workspace.",
                [],
                {},
            )

        # Filter those belonging to the same workspace via workspace_members
        platform_ids = [
            r.get("platform_user_id") for r in member_rows.data if r.get("platform_user_id")
        ]
        if not platform_ids:
            return ("❌ **Error:** Unable to resolve mentioned users.", [], {})

        wm_rows = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("ws_id", workspace_id)
            .in_("user_id", platform_ids)
            .execute()
        )
        valid_user_ids = [r.get("user_id") for r in (wm_rows.data or []) if r.get("user_id")]
        if not valid_user_ids:
            return (
                "❌ **Error:** Mentioned users are not members of this workspace.",
                [],
                {},
            )

        return (None, valid_user_ids, member_rows.data)

    async def handle_assign_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict[str, Any]],
        user_info: dict | None = None,
    ) -> None:
        """Handle the /assign command to assign users to a task.

        Expects options:
          - task_id: UUID of task
          - users: string containing one or more @mentions separated by space or comma

        Process:
          1. Validate workspace/user context
          2. Validate task exists and belongs to workspace via list->board->workspace chain
          3. Parse mentions -> discord_user_ids
          4. Map discord_user_ids -> platform_user_ids
             (must belong to same workspace)
          5. Insert rows into task assignments table (assumed schema).
             If table absent, respond with informative error.
        """
        # Validate inputs
        error_msg, task_id, _users_raw, mentioned_ids, workspace_id = self._validate_assign_inputs(
            options, user_info
        )
        if error_msg:
            await self.discord_client.send_response(
                {"content": error_msg},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Validate task and get valid users
            error_msg, valid_user_ids, member_rows_data = await self._validate_task_and_get_users(
                supabase, task_id, workspace_id, mentioned_ids
            )
            if error_msg:
                await self.discord_client.send_response(
                    {"content": error_msg},
                    app_id,
                    interaction_token,
                )
                return

            # Insert assignments. Assume a table task_assignees
            # (task_id uuid, user_id uuid, created_at timestamptz, unique(task_id,user_id))
            # We'll upsert-like by ignoring conflicts if Supabase configured with unique constraint
            # (client lacks native upsert for simple ignore w/out update in python, so try/except
            # duplicates)
            inserted = 0
            new_mentions: list[str] = []
            # Build map discord_user_id -> platform_user_id for quick reverse lookup
            discord_to_platform = {
                r.get("platform_user_id"): r.get("discord_user_id")
                for r in (member_rows_data or [])
                if r.get("platform_user_id") and r.get("discord_user_id")
            }
            for uid in valid_user_ids:
                try:
                    res = (
                        supabase.table("task_assignees")
                        .insert({"task_id": task_id, "user_id": uid})
                        .execute()
                    )
                    if res.data:
                        inserted += 1
                        discord_id = discord_to_platform.get(uid)
                        if discord_id:
                            new_mentions.append(f"<@{discord_id}>")
                except Exception as e:  # likely duplicate
                    print(f"Assign duplicate or error for user {uid}: {e}")
                    continue

            # Prepare response
            if inserted == 0:
                message = "i No new assignees added (they might already be assigned)."
            else:
                mention_list = (
                    ", ".join(new_mentions) if new_mentions else "(no resolvable mentions)"
                )
                message = f"✅ Added {inserted} assignee(s) to task `{task_id}`: {mention_list}"

            await self.discord_client.send_response(
                {"content": message},
                app_id,
                interaction_token,
            )

        except Exception as e:
            print(f"Error in assign command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to assign users: {e}"},
                app_id,
                interaction_token,
            )

    async def handle_unassign_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict[str, Any]],
        user_info: dict | None = None,
    ) -> None:
        """Handle the /unassign command to remove users from a task.

        Logic mirrors /assign but deletes rows from task_assignees.
        """
        # Validate inputs
        error_msg, task_id, _users_raw, mentioned_ids, workspace_id = self._validate_assign_inputs(
            options, user_info
        )
        if error_msg:
            await self.discord_client.send_response(
                {"content": error_msg},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Validate task and get valid users
            error_msg, valid_user_ids, member_rows_data = await self._validate_task_and_get_users(
                supabase, task_id, workspace_id, mentioned_ids
            )
            if error_msg:
                await self.discord_client.send_response(
                    {"content": error_msg},
                    app_id,
                    interaction_token,
                )
                return

            # Delete assignments
            removed = 0
            removed_mentions: list[str] = []
            # Build map platform_user_id -> discord_user_id for mention reconstruction
            discord_map = {
                r.get("platform_user_id"): r.get("discord_user_id")
                for r in (member_rows_data or [])
                if r.get("platform_user_id") and r.get("discord_user_id")
            }
            for uid in valid_user_ids:
                try:
                    # Delete where matches task & user
                    del_res = (
                        supabase.table("task_assignees")
                        .delete()
                        .eq("task_id", task_id)
                        .eq("user_id", uid)
                        .execute()
                    )
                    if del_res.data:
                        removed += len(del_res.data)
                        discord_id = discord_map.get(uid)
                        if discord_id:
                            removed_mentions.append(f"<@{discord_id}>")
                except Exception as e:
                    print(f"Unassign error for user {uid}: {e}")
                    continue

            if removed == 0:
                message = "i No assignees were removed (they may not have been assigned)."
            else:
                mention_list = (
                    ", ".join(removed_mentions) if removed_mentions else "(no resolvable mentions)"
                )
                message = (
                    f"✅ Removed {removed} assignment(s) from task `{task_id}`: {mention_list}"
                )

            await self.discord_client.send_response(
                {"content": message},
                app_id,
                interaction_token,
            )

        except Exception as e:
            print(f"Error in unassign command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to unassign users: {e}"},
                app_id,
                interaction_token,
            )

    async def handle_assignees_command(
        self,
        app_id: str,
        interaction_token: str,
        options: list[dict[str, Any]],
        user_info: dict | None = None,
    ) -> None:
        """Handle the /assignees command to list current task assignees.

        Steps:
          1. Validate user/workspace context
          2. Validate task exists and belongs to workspace
          3. Fetch current assignees via task_assignees join to users + discord mapping
          4. Render nicely with display names + Discord mentions + count summary
        """
        if not user_info:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Unable to identify user/workspace."},
                app_id,
                interaction_token,
            )
            return

        raw: dict[str, Any] = {opt["name"]: opt.get("value") for opt in options}
        task_id = str(raw.get("task_id") or "").strip()
        if not task_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** task_id is required."},
                app_id,
                interaction_token,
            )
            return

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            await self.discord_client.send_response(
                {"content": "❌ **Error:** Missing workspace context."},
                app_id,
                interaction_token,
            )
            return

        try:
            supabase = get_supabase_client()

            # Validate task belongs to workspace
            task_result = (
                supabase.table("tasks")
                .select(
                    "id, list_id, task_lists!inner(id, board_id, workspace_boards!inner(id, ws_id))"
                )
                .eq("id", task_id)
                .eq("deleted", False)
                .execute()
            )
            if not task_result.data:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Task not found or deleted."},
                    app_id,
                    interaction_token,
                )
                return

            task_row = task_result.data[0]
            ws_via_task = ((task_row.get("task_lists") or {}).get("workspace_boards") or {}).get(
                "ws_id"
            )
            if not ws_via_task or ws_via_task != workspace_id:
                await self.discord_client.send_response(
                    {"content": "❌ **Error:** Task does not belong to your workspace."},
                    app_id,
                    interaction_token,
                )
                return

            # Fetch assignees
            # Assuming task_assignees(user_id, task_id) and users table for display info
            assignee_rows = (
                supabase.table("task_assignees")
                .select("user_id, users!inner(display_name, handle)")
                .eq("task_id", task_id)
                .execute()
            )
            rows = assignee_rows.data or []
            if not rows:
                await self.discord_client.send_response(
                    {"content": f"📭 No current assignees for task `{task_id}`."},
                    app_id,
                    interaction_token,
                )
                return

            # Map platform_user_id -> discord_user_id
            # (Optionally we could filter to only those in this workspace,
            # but membership enforced earlier.)
            discord_map_rows = (
                supabase.table("discord_guild_members")
                .select("platform_user_id, discord_user_id")
                .execute()
            )
            discord_map = {
                r.get("platform_user_id"): r.get("discord_user_id")
                for r in (discord_map_rows.data or [])
                if r.get("platform_user_id") and r.get("discord_user_id")
            }

            assignees: list[str] = []
            for r in rows:
                uid = r.get("user_id")
                user_meta = r.get("users") or {}
                display_name = user_meta.get("display_name") or user_meta.get("handle") or "User"
                if uid in discord_map:
                    assignees.append(f"• **{display_name}** (<@{discord_map[uid]}>)")
                else:
                    assignees.append(f"• **{display_name}**")

            header = f"👥 **Assignees for Task `{task_id}`**\n\n"
            body = "\n".join(assignees)
            summary = f"\n\nTotal: **{len(assignees)}** assignee(s)."
            message = header + body + summary

            # Truncate if somehow exceeds Discord limit (2000 chars)
            if len(message) > 1900:
                # Keep header and summary, truncate body lines
                available = 1900 - len(header) - len(summary) - 20
                truncated_body = []
                current = 0
                for line in assignees:
                    if current + len(line) + 1 > available:
                        truncated_body.append("… (truncated)")
                        break
                    truncated_body.append(line)
                    current += len(line) + 1
                message = header + "\n".join(truncated_body) + summary

            await self.discord_client.send_response(
                {"content": message},
                app_id,
                interaction_token,
            )
        except Exception as e:
            print(f"Error in assignees command: {e}")
            await self.discord_client.send_response(
                {"content": f"❌ **Error:** Failed to list assignees: {e}"},
                app_id,
                interaction_token,
            )

    async def _make_stats_request(self, url: str) -> tuple[int | None, dict | str | None]:
        """Make a single stats API request.

        Returns (status_code, data) or (None, error_msg) on error.
        """
        try:
            async with aiohttp.ClientSession() as session, session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return (response.status, data)
                return (response.status, response.headers.get("Retry-After"))
        except TimeoutError:
            return (None, "timeout")
        except Exception as e:
            print(f"Request error: {e}")
            return (None, str(e))

    async def _handle_stats_response(
        self, status: int | None, result: dict | str | None, attempt: int, max_attempts: int
    ) -> dict | str | None:
        """Process stats API response and determine next action.

        Returns: stats dict | sentinel dict | "retry" | "continue" | None
        """
        # Success
        if status == 200:
            stats = result.get("stats", {}) if isinstance(result, dict) else {}
            return stats if stats else {"_empty": True}

        # Auth errors
        if status in (401, 403):
            return {"_unauthorized": True}

        # Rate limiting
        if status == 429:
            retry_after = None
            if result and isinstance(result, str):
                with contextlib.suppress(ValueError, TypeError):
                    retry_after = float(result)
            if attempt < max_attempts:
                backoff_seconds = retry_after or (2**attempt)
                print(
                    f"Rate limited (429). Attempt {attempt}/{max_attempts}. "
                    f"Sleeping {backoff_seconds:.1f}s"
                )
                await asyncio.sleep(backoff_seconds)
                return "continue"
            return {"_rate_limited": True, "_retry_after_seconds": retry_after}

        # Server errors or timeouts - retry
        if (status in {500, 502, 503, 504} or status is None) and attempt < max_attempts:
            backoff_seconds = 2**attempt
            error_type = f"Server error {status}" if status else "Request error"
            print(f"{error_type}. Attempt {attempt}/{max_attempts}. Sleeping {backoff_seconds}s")
            await asyncio.sleep(backoff_seconds)
            return "continue"

        # Other statuses or final attempt
        if status:
            print(f"Failed to fetch stats: HTTP {status}")
        return None

    async def _fetch_time_tracking_stats(self, user_info: dict) -> dict | None:
        """Fetch time tracking statistics from the API with basic retry/backoff.

        Returns either the stats dict or a sentinel dict with one of:
          {"_rate_limited": True, "_retry_after_seconds": <float?>}
          {"_unauthorized": True}
          {"_empty": True} when 200 OK but stats missing/empty
        Returns None only for unrecoverable unexpected errors.
        """
        try:
            workspace_id = user_info.get("workspace_id")
            platform_user_id = user_info.get("platform_user_id")

            if not workspace_id or not platform_user_id:
                return {"_unauthorized": True}

            base_url = get_base_url()
            today_url = (
                f"{base_url}/api/v1/workspaces/{workspace_id}/time-tracking/sessions"
                f"?type=stats&userId={platform_user_id}"
            )

            max_attempts = 3
            for attempt in range(1, max_attempts + 1):
                status, result = await self._make_stats_request(today_url)
                response = await self._handle_stats_response(status, result, attempt, max_attempts)

                if response == "continue":
                    continue
                if isinstance(response, dict) or response is None:
                    return response  # Return stats, sentinel dict, or None

            return None
        except Exception as e:
            print(f"Error fetching time tracking stats (outer): {e}")
            return None

    def _format_daily_report(self, stats: dict, user_info: dict) -> str:
        """Format the daily report for Discord display."""
        # Get GMT+7 timezone
        gmt_plus_7 = pytz.timezone("Asia/Bangkok")  # GMT+7
        now_gmt7 = dt.now(gmt_plus_7)

        # Format times
        def format_duration(seconds: int) -> str:
            if seconds < 60:
                return f"{seconds}s"
            if seconds < 3600:
                minutes = seconds // 60
                remaining_seconds = seconds % 60
                return f"{minutes}m {remaining_seconds}s"
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
        report = "# 📊 Daily Time Tracking Report\n\n"
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
            sorted_activity = sorted(daily_activity, key=lambda x: x["date"], reverse=True)[:7]

            for day in sorted_activity:
                date_obj = dt.fromisoformat(day["date"])
                day_name = date_obj.strftime("%a")
                duration = format_duration(day["duration"])
                sessions = day["sessions"]

                # Create a simple bar chart
                bar_length = min(20, max(1, int(day["duration"] / 3600 * 2)))  # 1 hour = 2 bars
                bar = "█" * bar_length + "░" * (20 - bar_length)

                report += f"**{day_name} {day['date']}:** {duration} ({sessions} sessions)\n"
                report += f"`{bar}`\n"

        # Motivational message based on today's time
        if today_time == 0:
            report += "\n💡 **Tip:** Start your first time tracking session today!"
        elif today_time < 1800:  # Less than 30 minutes
            report += "\n💡 **Tip:** Great start! Keep building your productive habits."
        elif today_time < 14400:  # Less than 4 hours
            report += "\n💡 **Tip:** Good progress! You're building momentum."
        else:  # 4+ hours
            report += "\n💡 **Tip:** Excellent work! You're maintaining great productivity."

        return report

    def _get_workspace_members(self, workspace_id: str) -> list[dict]:
        """Fetch workspace members with display names & handles via Supabase service role.

        Returns a list of dicts: { platform_user_id, display_name, handle }
        """
        try:
            supabase = get_supabase_client()
            # Select workspace members joined to users table (as seen elsewhere in utils.py)
            result = (
                supabase.table("workspace_members")
                .select("user_id, users!inner(display_name, handle)")
                .eq("ws_id", workspace_id)
                .execute()
            )
            rows = result.data or []
            members: list[dict] = []
            for r in rows:
                users_obj = r.get("users") or {}
                members.append(
                    {
                        "platform_user_id": r.get("user_id"),
                        "display_name": users_obj.get("display_name"),
                        "handle": users_obj.get("handle"),
                    }
                )
            filtered = [m for m in members if m.get("platform_user_id")]
            if not filtered:
                print(
                    f"⚠️ _get_workspace_members: No members found for "
                    f"ws_id={workspace_id} (raw count={len(rows)})"
                )
            else:
                print(
                    f"🤖 _get_workspace_members: Retrieved {len(filtered)} members "
                    f"for ws_id={workspace_id}"
                )
            return filtered
        except Exception as e:
            print(f"Error fetching workspace members: {e}")
            return []

    def _calculate_time_buckets(self, target_date=None):
        """Calculate time bucket boundaries for tracking stats.

        Returns (start_of_day, start_of_yesterday, start_of_week, start_of_month, tz).
        """
        tz = ZoneInfo("Asia/Ho_Chi_Minh")

        if target_date and target_date.tzinfo is None:
            # Assume naive timestamps are already in the target timezone
            base_date = target_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)
        elif target_date:
            base_date = target_date.astimezone(tz).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        else:
            # Use current date in the target timezone
            base_date = datetime.datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)

        start_of_day = base_date
        start_of_yesterday = start_of_day - datetime.timedelta(days=1)
        start_of_week = start_of_day - datetime.timedelta(days=start_of_day.weekday())
        start_of_month = start_of_day.replace(day=1)

        return start_of_day, start_of_yesterday, start_of_week, start_of_month, tz

    def _process_tracking_session(
        self,
        row: dict,
        agg_map: dict,
        start_of_day,
        start_of_yesterday,
        start_of_week,
        start_of_month,
        tz,
    ):
        """Process a single tracking session row and update aggregation map."""
        uid = row.get("user_id")
        if uid not in agg_map or not row.get("start_time"):
            return

        dur = row.get("duration_seconds") or 0
        try:
            started = datetime.datetime.fromisoformat(str(row["start_time"]).replace("Z", "+00:00"))
            started = started.replace(tzinfo=datetime.UTC) if started.tzinfo is None else started
            started_local = started.astimezone(tz)
        except Exception as e:
            print(f"Error parsing time tracking data: {e}")
            return

        # Update time buckets
        if started_local >= start_of_month:
            agg_map[uid]["monthTime"] += dur
        if started_local >= start_of_week:
            agg_map[uid]["weekTime"] += dur
        if started_local >= start_of_day:
            agg_map[uid]["todayTime"] += dur
        elif started_local >= start_of_yesterday:
            agg_map[uid]["yesterdayTime"] += dur

    def _fetch_workspace_time_tracking_stats(self, workspace_id: str, target_date=None):
        """Aggregate time tracking stats for all users in a workspace via Supabase.

        Assumptions (adjust if schema differs):
          - Table `time_tracking_sessions` with columns:
              user_id (uuid), ws_id (uuid), started_at (timestamptz), duration_seconds (int)
          - Session duration already finalized; active sessions ignored here.
        If schema doesn't match, returns (None, []).
        Returns (aggregated_list, members_metadata)
        """
        # NOTE: If this function returns (None, []), the caller will fallback to the legacy
        # per-user HTTP stats fetch with retry/backoff. This preserves behavior when the
        # assumed direct DB schema is not present or an unexpected error occurs.
        # For performance with large workspaces, consider replacing this client-side
        # aggregation with a Postgres RPC or materialized view.
        try:
            supabase = get_supabase_client()

            # Calculate time boundaries
            start_of_day, start_of_yesterday, start_of_week, start_of_month, tz = (
                self._calculate_time_buckets(target_date)
            )

            # Fetch members first
            members = self._get_workspace_members(workspace_id)
            if not members:
                return [], []
            user_ids = [m["platform_user_id"] for m in members if m.get("platform_user_id")]
            if not user_ids:
                return [], members

            # Fetch sessions and aggregate
            month_iso = start_of_month.isoformat()
            query = (
                supabase.table("time_tracking_sessions")
                .select("user_id, start_time, duration_seconds")
                .eq("ws_id", workspace_id)
                .gte("start_time", month_iso)
            )
            rows = query.execute().data or []

            # Initialize aggregation map
            agg_map = {
                uid: {"todayTime": 0, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0}
                for uid in user_ids
            }

            # Process each session
            for row in rows:
                self._process_tracking_session(
                    row,
                    agg_map,
                    start_of_day,
                    start_of_yesterday,
                    start_of_week,
                    start_of_month,
                    tz,
                )

            # Build final aggregated list
            aggregated = [
                {"user": m, "stats": agg_map[m["platform_user_id"]]}
                for m in members
                if m.get("platform_user_id") and agg_map.get(m["platform_user_id"])
            ]
            return aggregated, members
        except Exception as e:
            print(f"_fetch_workspace_time_tracking_stats fallback due to error: {e}")
            return None, []

    def _get_discord_user_map(self, _workspace_id: str) -> dict[str, str]:
        """Return mapping platform_user_id -> discord_user_id.

        Optionally filtered by workspace integration.
        """
        try:
            supabase = get_supabase_client()
            # We fetch all guild members; optional optimization:
            # filter by guilds linked to workspace
            result = (
                supabase.table("discord_guild_members")
                .select("platform_user_id, discord_user_id")
                .execute()
            )
            mapping: dict[str, str] = {}
            for row in result.data or []:
                puid = row.get("platform_user_id")
                duid = row.get("discord_user_id")
                if puid and duid:
                    mapping[puid] = duid
            return mapping
        except Exception as e:
            print(f"_get_discord_user_map error: {e}")
            return {}

    def _render_workspace_report(
        self,
        aggregated: list[dict],
        members_meta: list[dict],
        workspace_id: str,
        target_date=None,
    ) -> str:
        """Render clean workspace report with display names and Discord mentions."""
        tz = pytz.timezone("Asia/Bangkok")
        now = dt.now(tz)

        def fmt_dur(sec: int) -> str:
            if sec < 60:
                return f"{sec}s"
            if sec < 3600:
                return f"{sec // 60}m"
            return f"{sec // 3600}h {(sec % 3600) // 60}m"

        total_today = sum(a["stats"].get("todayTime", 0) for a in aggregated)
        total_yesterday = sum(a["stats"].get("yesterdayTime", 0) for a in aggregated)
        total_week = sum(a["stats"].get("weekTime", 0) for a in aggregated)
        total_month = sum(a["stats"].get("monthTime", 0) for a in aggregated)
        active_users_today = sum(1 for a in aggregated if a["stats"].get("todayTime", 0) > 0)

        # Sort (already sorted earlier but ensure)
        aggregated.sort(key=lambda x: x["stats"].get("todayTime", 0), reverse=True)

        def get_medal(rank: int) -> str:
            medals = {1: "🥇", 2: "🥈", 3: "🥉"}
            return medals.get(rank, f"**{rank}.**")

        discord_map = self._get_discord_user_map(workspace_id)

        # Header with clean totals
        date_str = target_date.strftime("%B %d, %Y") if target_date else "Today"
        header = f"""# 📊 **Workspace Daily Report** - {date_str}

**📈 Totals**
🌅 Today: **{fmt_dur(total_today)}** | 🌆 Yesterday: **{fmt_dur(total_yesterday)}**
📅 Week: **{fmt_dur(total_week)}** | 📆 Month: **{fmt_dur(total_month)}**
👥 Active Users: **{active_users_today}** of **{len(members_meta)}**

## 🏆 **Top Contributors**"""

        # User listings
        lines = []
        top_limit = 10
        for idx, item in enumerate(aggregated[:top_limit], start=1):
            user = item["user"]
            puid = user.get("platform_user_id")
            display_name = user.get("display_name") or user.get("handle") or "User"
            st = item["stats"]

            today = st.get("todayTime", 0)
            yesterday = st.get("yesterdayTime", 0)
            week = st.get("weekTime", 0)
            month = st.get("monthTime", 0)

            medal = get_medal(idx)

            # Format user with display name and mention
            if puid in discord_map:
                user_display = f"**{display_name}** (<@{discord_map[puid]}>)"
            else:
                user_display = f"**{display_name}**"

            # User name line
            lines.append(f"{medal} {user_display}")

            # Metrics - each on new line with emoji and text
            lines.append(f"    🌅 **Today:** {fmt_dur(today)}")
            lines.append(f"    🌆 **Yesterday:** {fmt_dur(yesterday)}")
            lines.append(f"    📅 **Week:** {fmt_dur(week)}")
            lines.append(f"    📆 **Month:** {fmt_dur(month)}")
            lines.append("")  # Spacing between users

        if len(aggregated) > top_limit:
            lines.append(f"*... and {len(aggregated) - top_limit} more contributors*")

        # Footer
        footer = f"\n*📅 Generated: {now.strftime('%B %d, %Y at %H:%M')} (GMT+7)*"

        return header + "\n" + "\n".join(lines) + footer

    async def handle_board_selection_sync(
        self, board_id: str, user_info: dict | None = None
    ) -> dict:
        """Handle board selection synchronously and return response data."""
        if not user_info:
            return {"content": "❌ **Error:** Unable to identify user/workspace.", "components": []}

        workspace_id = user_info.get("workspace_id")
        if not workspace_id:
            return {"content": "❌ **Error:** Missing workspace context.", "components": []}

        try:
            supabase = get_supabase_client()

            # Validate board exists and belongs to workspace
            board_result = (
                supabase.table("workspace_boards")
                .select("id, name")
                .eq("id", board_id)
                .eq("ws_id", workspace_id)
                .eq("deleted", False)
                .execute()
            )
            if not board_result.data:
                return {
                    "content": "❌ **Error:** Board not found in your workspace.",
                    "components": [],
                }

            board = board_result.data[0]
            board_name = board.get("name", "Unknown Board")

            # Fetch task lists in the board
            lists_result = (
                supabase.table("task_lists")
                .select("id, name, status, created_at")
                .eq("board_id", board_id)
                .eq("deleted", False)
                .order("position")
                .order("created_at")
                .execute()
            )

            if not lists_result.data:
                return {
                    "content": (
                        f"📝 **No task lists found** in board '{board_name}'.\n\n"
                        "_Create lists on the web dashboard first._"
                    ),
                    "components": [],
                }

            # Create interactive list selection
            components = self.discord_client.create_list_selection_components(
                lists_result.data, board_id
            )
            content = (
                f"🎫 **Create Ticket - Step 2/2**\n\n**Board:** {board_name}\n\n"
                "Choose a list to create your ticket in:"
            )

            return {"content": content, "components": components}

        except Exception as e:
            print(f"Error in board selection: {e}")
            return {"content": f"❌ **Error:** Failed to load lists: {e!s}", "components": []}

    def create_ticket_form_modal(self, list_id: str, _user_info: dict | None = None) -> dict:
        """Create ticket form modal data."""
        try:
            supabase = get_supabase_client()

            # Get list information including board details
            list_result = (
                supabase.table("task_lists")
                .select("id, name, board_id, workspace_boards!inner(id, name)")
                .eq("id", list_id)
                .eq("deleted", False)
                .execute()
            )

            if not list_result.data:
                # Return error instead of invalid modal
                return {
                    "type": DiscordResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    "data": {
                        "content": "❌ **Error:** List not found.",
                        "flags": 64,  # EPHEMERAL flag
                    },
                }

            list_data = list_result.data[0]
            list_name = list_data.get("name", "Unknown List")
            board_id = list_data.get("board_id")
            board_name = list_data.get("workspace_boards", {}).get("name", "Unknown Board")

            if not board_id:
                return {
                    "type": DiscordResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    "data": {
                        "content": "❌ **Error:** Board information not found.",
                        "flags": 64,  # EPHEMERAL flag
                    },
                }

            return self.discord_client.create_ticket_form_modal(
                board_id, list_id, board_name, list_name
            )

        except Exception as e:
            print(f"Error creating modal: {e}")
            # Return error instead of invalid modal
            return {
                "type": DiscordResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                "data": {
                    "content": f"❌ **Error:** Failed to create ticket form: {e!s}",
                    "flags": 64,  # EPHEMERAL flag
                },
            }
