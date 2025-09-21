"""Discord client functionality for the bot."""

import json
import os
from typing import Any, Dict, Optional

import aiohttp


class DiscordAPIError(RuntimeError):
    """Base exception for Discord API failures."""

    def __init__(self, message: str, *, status: int | None = None, code: int | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


class DiscordMissingAccessError(DiscordAPIError):
    """Raised when the bot lacks access to the target resource."""


class DiscordMissingPermissionsError(DiscordAPIError):
    """Raised when the bot is missing send/mention permissions."""


class DiscordClient:
    """Handles Discord API interactions."""

    @staticmethod
    async def send_response(payload: Dict, app_id: str, interaction_token: str) -> None:
        """Send a response to Discord."""
        interaction_url = f"https://discord.com/api/v10/webhooks/{app_id}/{interaction_token}/messages/@original"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(interaction_url, json=payload) as resp:
                    response_text = await resp.text()
                    print(f"🤖 Discord response: {response_text}")

                    if resp.status != 200:
                        print(
                            f"🤖 Discord error: Status {resp.status}, Response: {response_text}"
                        )
        except Exception as e:
            print(f"🤖 Error sending Discord response: {e}")
            raise

    @staticmethod
    def format_success_message(result: Dict) -> str:
        """Format a success message for link shortening."""
        return (
            f"🔗 **Link Shortened Successfully!**\n\n"
            f"**Original URL:** {result['original_url']}\n"
            f"**Shortened URL:** {result['shortened_url']}\n"
            f"**Slug:** `{result['slug']}`"
        )

    @staticmethod
    def format_error_message(error: str) -> str:
        """Format an error message."""
        return f"❌ **Error:** {error}"

    @staticmethod
    def format_unauthorized_message() -> str:
        """Format an unauthorized server message."""
        return "❌ **Error:** This bot is not available in this server."

    @staticmethod
    def format_unauthorized_user_message() -> str:
        """Format an unauthorized user message."""
        return (
            "❌ **Access Denied:** You are not authorized to use this bot.\n\n"
            "To use this bot, you must:\n"
            "1. Be a member of a workspace that has Discord integration enabled\n"
            "2. Have your Discord account linked to that workspace\n"
            "3. Use the bot in a server where your workspace has Discord integration\n\n"
            "Contact your workspace administrator to get access."
        )

    @staticmethod
    def format_missing_url_message() -> str:
        """Format a missing URL message."""
        return "❌ **Error:** URL is required."

    @staticmethod
    def format_unknown_command_message(command_name: str) -> str:
        """Format an unknown command message."""
        return f"❌ **Error:** Unknown command '{command_name}'"

    @staticmethod
    async def send_response_with_components(
        payload: Dict, app_id: str, interaction_token: str
    ) -> None:
        """Send a response with interactive components to Discord."""
        interaction_url = f"https://discord.com/api/v10/webhooks/{app_id}/{interaction_token}/messages/@original"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.patch(interaction_url, json=payload) as resp:
                    response_text = await resp.text()
                    print(f"🤖 Discord response with components: {response_text}")

                    if resp.status != 200:
                        print(
                            f"🤖 Discord error: Status {resp.status}, Response: {response_text}"
                        )
        except Exception as e:
            print(f"🤖 Error sending Discord response with components: {e}")
            raise

    @staticmethod
    def create_board_selection_components(boards: list) -> list:
        """Create interactive components for board selection."""
        if not boards:
            return []

        # Limit to 25 boards (Discord select menu limit)
        limited_boards = boards[:25]
        
        options = []
        for board in limited_boards:
            board_id = board.get("id")
            board_name = board.get("name", "Unnamed Board")
            # Truncate name if too long (Discord limit is 100 chars for option labels)
            display_name = board_name[:97] + "..." if len(board_name) > 100 else board_name
            
            options.append({
                "label": display_name,
                "value": board_id,
                "description": f"Board ID: {board_id[:20]}..."
            })

        select_menu = {
            "type": 3,  # SELECT_MENU
            "custom_id": "select_board_for_lists",
            "placeholder": "Choose a board to see its lists...",
            "options": options
        }

        return [{
            "type": 1,  # ACTION_ROW
            "components": [select_menu]
        }]

    @staticmethod
    async def send_channel_message(
        channel_id: str,
        content: str,
        allowed_mentions: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Send a message to a Discord channel."""
        bot_token = os.getenv("DISCORD_BOT_TOKEN")
        if not bot_token:
            raise RuntimeError("DISCORD_BOT_TOKEN environment variable is not set")

        url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
        headers = {
            "Authorization": f"Bot {bot_token}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {"content": content}
        if allowed_mentions is not None:
            payload["allowed_mentions"] = allowed_mentions

        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                if resp.status >= 400:
                    raw = await resp.text()
                    parsed: Dict[str, Any] = {}
                    try:
                        parsed = json.loads(raw)
                    except json.JSONDecodeError:
                        parsed = {"message": raw}

                    error_message = parsed.get("message", "Unknown Discord error")
                    error_code = parsed.get("code")

                    if resp.status == 403 and error_code == 50001:
                        raise DiscordMissingAccessError(
                            f"Missing access to channel {channel_id}: {error_message}",
                            status=resp.status,
                            code=error_code,
                        ) from None
                    if resp.status == 403 and error_code == 50013:
                        raise DiscordMissingPermissionsError(
                            f"Missing permissions to post in channel {channel_id}: {error_message}",
                            status=resp.status,
                            code=error_code,
                        ) from None

                    raise DiscordAPIError(
                        f"Failed to send channel message ({resp.status}): {error_message}",
                        status=resp.status,
                        code=error_code,
                    )

    @staticmethod
    def create_list_selection_components(lists: list, board_id: str) -> list:
        """Create interactive components for list selection."""
        if not lists:
            return []

        # Limit to 25 lists (Discord select menu limit)
        limited_lists = lists[:25]
        
        options = []
        status_emojis = {
            "not_started": "⚪",
            "active": "🟢", 
            "done": "✅",
            "closed": "🔴",
        }
        
        for task_list in limited_lists:
            list_id = task_list.get("id")
            list_name = task_list.get("name", "Unnamed List")
            status = task_list.get("status", "not_started")
            emoji = status_emojis.get(status, "⚪")
            
            # Truncate name if too long
            display_name = f"{emoji} {list_name}"
            if len(display_name) > 100:
                display_name = display_name[:97] + "..."
            
            options.append({
                "label": display_name,
                "value": f"{board_id}|{list_id}",  # Encode both IDs
                "description": f"Status: {status.replace('_', ' ').title()}"
            })

        select_menu = {
            "type": 3,  # SELECT_MENU
            "custom_id": "select_list_for_ticket",
            "placeholder": "Choose a list to create a ticket...",
            "options": options
        }

        return [{
            "type": 1,  # ACTION_ROW
            "components": [select_menu]
        }]

    @staticmethod
    def create_ticket_form_modal(board_id: str, list_id: str, board_name: str, list_name: str) -> Dict:
        """Create a modal form for ticket creation."""
        return {
            "type": 9,  # MODAL
            "data": {
                "custom_id": f"ticket_form|{board_id}|{list_id}",
                "title": f"Create Ticket: {list_name}",
                "components": [
                    {
                        "type": 1,  # ACTION_ROW
                        "components": [{
                            "type": 4,  # TEXT_INPUT
                            "custom_id": "ticket_title",
                            "label": "Task Title",
                            "style": 1,  # SHORT
                            "placeholder": "e.g. Fix login bug",
                            "required": True,
                            "max_length": 100
                        }]
                    },
                    {
                        "type": 1,  # ACTION_ROW
                        "components": [{
                            "type": 4,  # TEXT_INPUT
                            "custom_id": "ticket_description",
                            "label": "Description (Optional)",
                            "style": 2,  # PARAGRAPH
                            "placeholder": "Detailed description of the task...",
                            "required": False,
                            "max_length": 500
                        }]
                    },
                    {
                        "type": 1,  # ACTION_ROW
                        "components": [{
                            "type": 4,  # TEXT_INPUT
                            "custom_id": "ticket_priority",
                            "label": "Priority (1=Low, 2=Medium, 3=High, 4=Urgent)",
                            "style": 1,  # SHORT
                            "placeholder": "2",
                            "required": False,
                            "min_length": 1,
                            "max_length": 1
                        }]
                    }
                ]
            }
        }
