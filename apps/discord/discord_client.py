"""Discord client functionality for the bot."""

from typing import Dict

import aiohttp


class DiscordClient:
    """Handles Discord API interactions."""

    @staticmethod
    async def send_response(payload: Dict, app_id: str, interaction_token: str) -> None:
        """Send a response to Discord."""
        interaction_url = f"https://discord.com/api/v10/webhooks/{app_id}/{interaction_token}/messages/@original"

        async with aiohttp.ClientSession() as session:
            async with session.patch(interaction_url, json=payload) as resp:
                print("🤖 Discord response: " + await resp.text())

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
    def format_missing_url_message() -> str:
        """Format a missing URL message."""
        return "❌ **Error:** URL is required."

    @staticmethod
    def format_unknown_command_message(command_name: str) -> str:
        """Format an unknown command message."""
        return f"❌ **Error:** Unknown command '{command_name}'"
