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
        result = self.link_shortener.shorten_link(url, custom_slug, workspace_id)

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

        await self.discord_client.send_response(
            {"content": message}, app_id, interaction_token
        )

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
