"""Utility functions for the Discord bot."""

import os
import re
from typing import Any, cast
from urllib.parse import urlparse

import nanoid
from supabase import Client, create_client

from config import DEFAULT_SLUG_LENGTH, MAX_SLUG_LENGTH


def is_valid_url(url: str) -> bool:
    """Validate URL format."""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False


def is_valid_slug(slug: str) -> bool:
    """Validate custom slug format."""
    if not slug or len(slug) > MAX_SLUG_LENGTH:
        return False
    # Only allow letters, numbers, hyphens, and underscores
    return bool(re.match(r"^[a-zA-Z0-9_-]+$", slug))


def generate_slug(length: int = DEFAULT_SLUG_LENGTH) -> str:
    """Generate a random slug."""
    result: str = nanoid.generate(size=length)
    return result


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    return urlparse(url).netloc


def get_base_url() -> str:
    """Get the base URL for shortened links based on environment."""
    return "https://ttr.gg"


def get_supabase_client() -> Client:
    """Get Supabase client for database operations."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SECRET_KEY")

    if not supabase_url or not supabase_key:
        raise Exception("Supabase credentials not found in environment variables")

    return create_client(supabase_url, supabase_key)


def is_user_authorized_for_guild(discord_user_id: str, guild_id: str) -> bool:
    """
    Check if a Discord user is authorized to use commands in a specific guild.

    A user is authorized if:
    1. The guild has a Discord integration
    2. The user is linked to a workspace that has that Discord integration
    3. The user is a member of that workspace
    """
    try:
        supabase = get_supabase_client()

        # First, check if the guild has a Discord integration
        integration_result = (
            supabase.table("discord_integrations")
            .select("ws_id")
            .eq("discord_guild_id", guild_id)
            .execute()
        )

        if not integration_result.data:
            return False

        # Check if the Discord user is linked to any of these workspaces
        # Use a safer approach with separate queries to avoid join issues
        member_result = (
            supabase.table("discord_guild_members")
            .select("platform_user_id, discord_guild_id")
            .eq("discord_user_id", discord_user_id)
            .execute()
        )

        if not member_result.data:
            return False

        # Get the guild IDs that this user is linked to
        user_guild_ids = [
            cast(dict[str, Any], member)["discord_guild_id"] for member in member_result.data
        ]

        # Check if any of the user's guilds match the requested guild
        if guild_id not in user_guild_ids:
            return False

        # Verify that the user's guild has a Discord integration
        user_integration_result = (
            supabase.table("discord_integrations")
            .select("ws_id")
            .eq("discord_guild_id", guild_id)
            .execute()
        )

        return bool(user_integration_result.data)

    except Exception as e:
        print(f"🤖: Error checking user authorization: {e}")
        return False


def is_user_authorized_for_dm(discord_user_id: str) -> bool:
    """
    Check if a Discord user is authorized to use commands in DMs.

    A user is authorized if they are linked to any workspace that has Discord integration.
    """
    try:
        supabase = get_supabase_client()

        # Check if the Discord user is linked to any workspace with Discord integration
        member_result = (
            supabase.table("discord_guild_members")
            .select("discord_guild_id")
            .eq("discord_user_id", discord_user_id)
            .execute()
        )

        if not member_result.data:
            return False

        # Get the guild IDs that this user is linked to
        user_guild_ids = [
            cast(dict[str, Any], member)["discord_guild_id"] for member in member_result.data
        ]

        # Check if any of the user's guilds have Discord integrations
        for guild_id in user_guild_ids:
            integration_result = (
                supabase.table("discord_integrations")
                .select("id")
                .eq("discord_guild_id", guild_id)
                .execute()
            )
            if integration_result.data:
                return True

        return False

    except Exception as e:
        print(f"🤖: Error checking DM user authorization: {e}")
        return False


def get_user_workspace_info(discord_user_id: str, guild_id: str | None = None) -> dict | None:
    """
    Get workspace information for a Discord user in a specific guild.
    Returns workspace details if user is authorized, None otherwise.
    """
    try:
        supabase = get_supabase_client()
        workspace_id = None
        platform_user_id = None

        if guild_id:
            # For guild commands, get info for specific guild
            workspace_id, platform_user_id = _get_guild_workspace_info(
                supabase, discord_user_id, guild_id
            )
        else:
            # For DM commands, get info from any linked workspace
            workspace_id, platform_user_id = _get_dm_workspace_info(supabase, discord_user_id)

        if not workspace_id or not platform_user_id:
            return None

        # Get workspace member info
        workspace_member_result = (
            supabase.table("workspace_members")
            .select("users!inner(display_name, handle)")
            .eq("ws_id", workspace_id)
            .eq("user_id", platform_user_id)
            .execute()
        )

        if not workspace_member_result.data:
            return None

        member_info = cast(dict[str, Any], workspace_member_result.data[0])
        users_info = cast(dict[str, Any], member_info["users"])

        result = {
            "workspace_id": workspace_id,
            "platform_user_id": platform_user_id,
            "display_name": users_info["display_name"],
            "handle": users_info["handle"],
        }

        print(
            f"🤖: User workspace info: workspace_id={workspace_id}, "
            f"platform_user_id={platform_user_id}"
        )
        return result

    except Exception as e:
        print(f"🤖: Error getting user workspace info: {e}")
        return None


def _get_guild_workspace_info(
    supabase, discord_user_id: str, guild_id: str
) -> tuple[str | None, str | None]:
    """Get workspace info for a guild-based command."""
    integration_result = (
        supabase.table("discord_integrations")
        .select("ws_id")
        .eq("discord_guild_id", guild_id)
        .execute()
    )

    if not integration_result.data:
        return None, None

    workspace_id = cast(dict[str, Any], integration_result.data[0])["ws_id"]

    # Get user's platform user ID for this specific guild
    member_result = (
        supabase.table("discord_guild_members")
        .select("platform_user_id")
        .eq("discord_user_id", discord_user_id)
        .eq("discord_guild_id", guild_id)
        .execute()
    )

    if not member_result.data:
        return None, None

    platform_user_id = cast(dict[str, Any], member_result.data[0])["platform_user_id"]
    return workspace_id, platform_user_id


def _get_dm_workspace_info(supabase, discord_user_id: str) -> tuple[str | None, str | None]:
    """Get workspace info for a DM-based command."""
    member_result = (
        supabase.table("discord_guild_members")
        .select("platform_user_id, discord_guild_id")
        .eq("discord_user_id", discord_user_id)
        .execute()
    )

    if not member_result.data:
        return None, None

    platform_user_id = cast(dict[str, Any], member_result.data[0])["platform_user_id"]

    # Get all workspace IDs for this user's guilds and find one they're actually a member of
    user_guild_ids = [
        cast(dict[str, Any], member)["discord_guild_id"] for member in member_result.data
    ]

    for user_guild_id in user_guild_ids:
        # Get workspace ID for this guild
        integration_result = (
            supabase.table("discord_integrations")
            .select("ws_id")
            .eq("discord_guild_id", user_guild_id)
            .execute()
        )

        if integration_result.data:
            potential_workspace_id = cast(dict[str, Any], integration_result.data[0])["ws_id"]

            # Check if the user is actually a member of this workspace
            workspace_member_check = (
                supabase.table("workspace_members")
                .select("user_id")
                .eq("ws_id", potential_workspace_id)
                .eq("user_id", platform_user_id)
                .execute()
            )

            if workspace_member_check.data:
                return potential_workspace_id, platform_user_id

    print(f"🤖: No valid workspace found for Discord user {discord_user_id} in DM context")
    return None, None
