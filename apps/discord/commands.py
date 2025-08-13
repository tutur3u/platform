"""Discord slash command definitions and handlers."""

from typing import Dict, List

import aiohttp
from config import ALLOWED_GUILD_IDS, DiscordResponseType
from discord_client import DiscordClient
from link_shortener import LinkShortener


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

    async def handle_api_command(self, app_id: str, interaction_token: str) -> None:
        """Handle the /api command."""
        message = await self._fetch_api_data()
        await self.discord_client.send_response(
            {"content": message}, app_id, interaction_token
        )

    async def handle_shorten_command(
        self, app_id: str, interaction_token: str, options: List[Dict]
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

        # Shorten the link
        result = self.link_shortener.shorten_link(url, custom_slug)

        # Format and send response
        if result.get("success"):
            message = self.discord_client.format_success_message(result)
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
