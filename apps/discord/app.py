"""Main Discord bot application."""

import json
from typing import Optional, cast

import modal
from auth import DiscordAuth
from commands import CommandHandler
from config import DiscordInteractionType, DiscordResponseType

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "fastapi[standard]",
        "pynacl",
        "requests",
        "supabase",
        "nanoid",
        "pytz",
        "aiohttp",
    )
    .add_local_python_source(
        "auth",
        "commands",
        "config",
        "discord_client",
        "link_shortener",
        "utils",
        "wol_reminder",
    )
)

app = modal.App("tuturuuu-discord-bot", image=image)

# Add Supabase secret
supabase_secret = modal.Secret.from_name(
    "supabase-secret",
    required_keys=[
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ],
)

# Discord secret
discord_secret = modal.Secret.from_name(
    "discord-secret",
    required_keys=[
        "DISCORD_BOT_TOKEN",
        "DISCORD_CLIENT_ID",
        "DISCORD_PUBLIC_KEY",
        "DISCORD_ANNOUNCEMENT_CHANNEL",
    ],
)


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_shorten_link(
    app_id: str,
    interaction_token: str,
    url: str,
    custom_slug: Optional[str] = None,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle link shortening with authorization."""
    handler = CommandHandler()

    # Check authorization
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                print(f"🤖: unauthorized user {user_id} in guild {guild_id}")
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                print(f"🤖: unauthorized user {user_id} in DM")
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    # Get user info for context
    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")
        if user_info:
            print(
                f"🤖: authorized user {user_id} ({user_info.get('display_name', 'Unknown')}) from workspace {user_info.get('workspace_id')}"
            )

    options = [{"name": "url", "value": url}]
    if custom_slug:
        options.append({"name": "custom_slug", "value": custom_slug})

    try:
        print(f"🤖: Calling handle_shorten_command for user {user_id}")
        if user_info:
            await handler.handle_shorten_command(
                app_id, interaction_token, options, user_info
            )
        else:
            await handler.handle_shorten_command(
                app_id,
                interaction_token,
                options,
                None,  # type: ignore[arg-type]
            )
        print("🤖: handle_shorten_command completed successfully")
    except Exception as e:
        print(f"🤖: Error in handle_shorten_command: {e}")
        import traceback

        traceback.print_exc()

        # Send error response to Discord
        try:
            await handler.discord_client.send_response(
                {"content": f"❌ **Error:** {str(e)}"}, app_id, interaction_token
            )
        except Exception as response_error:
            print(f"🤖: Failed to send error response: {response_error}")


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_daily_report(
    app_id: str,
    interaction_token: str,
    options: list,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /daily-report command with authorization."""
    handler = CommandHandler()

    # Check authorization
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                print(f"🤖: unauthorized user {user_id} in guild {guild_id}")
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                print(f"🤖: unauthorized user {user_id} in DM")
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    # Get user info for context
    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")
        if user_info:
            print(
                f"🤖: authorized user {user_id} ({user_info.get('display_name', 'Unknown')}) from workspace {user_info.get('workspace_id')}"
            )

    try:
        print(f"🤖: Calling handle_daily_report_command for user {user_id}")
        await handler.handle_daily_report_command(
            app_id, interaction_token, options, user_info
        )
        print("🤖: handle_daily_report_command completed successfully")
    except Exception as e:
        print(f"🤖: Error in handle_daily_report_command: {e}")
        import traceback

        traceback.print_exc()

        # Send error response to Discord
        try:
            await handler.discord_client.send_response(
                {"content": f"❌ **Error:** {str(e)}"}, app_id, interaction_token
            )
        except Exception as response_error:
            print(f"🤖: Failed to send error response: {response_error}")


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_tumeet_plan(
    app_id: str,
    interaction_token: str,
    options: list,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /tumeet command with authorization and option parsing."""
    handler = CommandHandler()

    # Authorization (same pattern)
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_tumeet_plan_command(
            app_id, interaction_token, options or [], user_info
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[discord_secret, supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_wol_reminder(
    app_id: str,
    interaction_token: str,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /wol-reminder command with authorization checks."""
    handler = CommandHandler()

    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_wol_reminder_command(
            app_id,
            interaction_token,
            user_info,
        )
    except Exception as error:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {error}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_ticket(
    app_id: str,
    interaction_token: str,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle boards list command with authorization."""
    handler = CommandHandler()

    # Authorization (same pattern as other commands)
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_boards_command(app_id, interaction_token, user_info)
    except Exception as e:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_assign(
    app_id: str,
    interaction_token: str,
    options: list,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /assign command with authorization."""
    handler = CommandHandler()

    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_assign_command(app_id, interaction_token, options or [], user_info)
    except Exception as e:
        import traceback
        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_unassign(
    app_id: str,
    interaction_token: str,
    options: list,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /unassign command with authorization."""
    handler = CommandHandler()

    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_unassign_command(app_id, interaction_token, options or [], user_info)
    except Exception as e:
        import traceback
        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_assignees(
    app_id: str,
    interaction_token: str,
    options: list,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
):
    """Handle /assignees command with authorization."""
    handler = CommandHandler()

    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_user_message()},
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    try:
        await handler.handle_assignees_command(app_id, interaction_token, options or [], user_info)
    except Exception as e:
        import traceback
        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def handle_board_selection_interaction(
    app_id: str,
    interaction_token: str,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
    selected_board_id: Optional[str] = None,
):
    """Handle board selection interaction with authorization."""
    handler = CommandHandler()

    # Authorization (same pattern as other commands)
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    if not selected_board_id:
        await handler.discord_client.send_response(
            {"content": "❌ **Error:** No board selected."},
            app_id,
            interaction_token,
        )
        return

    try:
        await handler.handle_board_selection_interaction(
            app_id, interaction_token, selected_board_id, user_info
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def handle_list_selection_interaction(
    app_id: str,
    interaction_token: str,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
    selected_list_id: Optional[str] = None,
):
    """Handle list selection interaction with authorization."""
    handler = CommandHandler()

    # Authorization (same pattern as other commands)
    if user_id:
        if guild_id:
            if not handler.is_user_authorized(user_id, guild_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return
        else:
            if not handler.is_user_authorized_for_dm(user_id):
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unauthorized_user_message()
                    },
                    app_id,
                    interaction_token,
                )
                return

    user_info = None
    if user_id:
        user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    if not selected_list_id:
        await handler.discord_client.send_response(
            {"content": "❌ **Error:** No list selected."},
            app_id,
            interaction_token,
        )
        return

    try:
        # For list selection, we need the board_id as well
        # We'll extract it from the workspace_boards associated with the list
        await handler.handle_list_selection_interaction(
            app_id, interaction_token, "", selected_list_id, user_info
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def handle_ticket_modal_submission(
    app_id: str,
    interaction_token: str,
    user_id: Optional[str] = None,
    guild_id: Optional[str] = None,
    list_id: Optional[str] = None,
    components: Optional[list] = None,
):
    """Handle ticket modal submission with authorization."""
    handler = CommandHandler()
    # NOTE: Modal was shown optimistically without pre-check. We must enforce
    # full authorization here before creating any task. This prevents an
    # unauthorized user from successfully creating resources even though they
    # could trigger the modal UI.
    if not user_id:
        await handler.discord_client.send_response(
            {"content": "❌ **Error:** Unable to identify user."},
            app_id,
            interaction_token,
        )
        return

    if guild_id:
        if not handler.is_user_authorized(user_id, guild_id):
            await handler.discord_client.send_response(
                {"content": handler.discord_client.format_unauthorized_user_message()},
                app_id,
                interaction_token,
            )
            return
    else:
        # DM context
        if not handler.is_user_authorized_for_dm(user_id):
            await handler.discord_client.send_response(
                {"content": handler.discord_client.format_unauthorized_user_message()},
                app_id,
                interaction_token,
            )
            return

    # Retrieve workspace/user context AFTER auth check to reduce DB lookups for rejected users
    user_info = handler.get_user_workspace_info(user_id, guild_id or "")

    if not list_id or not components:
        await handler.discord_client.send_response(
            {"content": "❌ **Error:** Invalid form submission."},
            app_id,
            interaction_token,
        )
        return

    # Extract form data from Discord components
    form_data = {}
    try:
        for action_row in components:
            for component in action_row.get("components", []):
                if component.get("type") == 4:  # TEXT_INPUT type
                    custom_id = component.get("custom_id", "")
                    value = component.get("value", "")
                    form_data[custom_id] = value
    except Exception as e:
        print(f"Error extracting form data: {e}")
        form_data = {}

    # Extract board_id from the custom_id of the modal
    # The interaction data should contain the custom_id in the format: ticket_form|{board_id}|{list_id}
    board_id = ""
    try:
        # Get the modal's custom_id from the interaction metadata
        # This is a bit tricky since we're in the Modal function context
        # We'll extract the board_id from the list relationship instead
        from utils import get_supabase_client

        if list_id:
            supabase = get_supabase_client()
            list_result = (
                supabase.table("task_lists")
                .select("board_id")
                .eq("id", list_id)
                .execute()
            )
            if list_result.data:
                board_id = list_result.data[0].get("board_id", "")
    except Exception as e:
        print(f"Error extracting board_id: {e}")
        board_id = ""

    try:
        await handler.handle_ticket_modal_submission(
            app_id, interaction_token, board_id, list_id, form_data, user_info
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        await handler.discord_client.send_response(
            {"content": f"❌ **Error:** {e}"}, app_id, interaction_token
        )


@app.function(secrets=[discord_secret], image=image)
def test_bot_token():
    """Test the bot token and check bot permissions."""
    import os

    import requests

    BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
    CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")

    if not BOT_TOKEN:
        raise Exception("DISCORD_BOT_TOKEN environment variable is not set")
    if not CLIENT_ID:
        raise Exception("DISCORD_CLIENT_ID environment variable is not set")

    print(f"🤖: Testing bot token for CLIENT_ID: {CLIENT_ID}")
    print(f"🤖: BOT_TOKEN starts with: {BOT_TOKEN[:10]}...")

    headers = {
        "Authorization": f"Bot {BOT_TOKEN}",
    }

    # Test 1: Get bot information
    print("🤖: Testing bot information...")
    bot_url = "https://discord.com/api/v10/users/@me"
    response = requests.get(bot_url, headers=headers)

    if response.status_code == 401:
        print(f"🤖: ❌ Bot token is invalid - Response: {response.text}")
        return False

    if response.status_code == 200:
        bot_data = response.json()
        print("🤖: ✅ Bot token is valid")
        print(f"🤖: Bot username: {bot_data.get('username')}")
        print(f"🤖: Bot ID: {bot_data.get('id')}")
        print(f"🤖: Bot flags: {bot_data.get('flags', 0)}")
    else:
        print(
            f"🤖: ⚠️ Unexpected response getting bot info: {response.status_code} - {response.text}"
        )
        return False

    # Test 2: Check if bot has applications.commands scope
    print("🤖: Testing applications.commands scope...")
    commands_url = f"https://discord.com/api/v10/applications/{CLIENT_ID}/commands"
    response = requests.get(commands_url, headers=headers)

    if response.status_code == 401:
        print(
            f"🤖: ❌ Bot doesn't have applications.commands scope - Response: {response.text}"
        )
        print("🤖: Make sure to:")
        print(
            "   1. Add the 'applications.commands' scope when creating the bot invite"
        )
        print("   2. Use the correct CLIENT_ID (not the bot's user ID)")
        print("   3. Ensure the bot has been added to at least one server")
        return False

    if response.status_code == 200:
        commands = response.json()
        print("🤖: ✅ Bot has applications.commands scope")
        print(f"🤖: Found {len(commands)} existing commands")
        for cmd in commands:
            print(f"    - {cmd.get('name')}: {cmd.get('description')}")
    else:
        print(
            f"🤖: ⚠️ Unexpected response checking commands: {response.status_code} - {response.text}"
        )
        return False

    return True


@app.function(secrets=[discord_secret, supabase_secret], image=image)
def create_slash_command(force: bool = False):
    """Register (or sync) global slash commands with Discord.

    Behaviour:
      - Default (force = False):
          * Create any commands that do not yet exist (matched by name).
          * Skip existing commands.
      - Force (force = True):
          * Delete any existing global commands whose names are NOT in our current definitions.
          * PATCH (update) existing commands whose names match (ensures description/options drift is fixed).
          * Create new commands that are missing.

    This ensures that running with --force leaves Discord's global command set in exact
    correspondence with our `CommandHandler.get_command_definitions()` output (a light
    reconciliation strategy without using the bulk overwrite endpoint, providing clearer logs).
    """
    import os

    import requests

    BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
    CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")

    # Validate environment variables
    if not BOT_TOKEN:
        raise Exception("DISCORD_BOT_TOKEN environment variable is not set")
    if not CLIENT_ID:
        raise Exception("DISCORD_CLIENT_ID environment variable is not set")

    print(f"🤖: Using CLIENT_ID: {CLIENT_ID}")
    print(
        f"🤖: BOT_TOKEN starts with: {BOT_TOKEN[:10]}..."
        if BOT_TOKEN
        else "🤖: BOT_TOKEN is empty"
    )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bot {BOT_TOKEN}",
    }
    url = f"https://discord.com/api/v10/applications/{CLIENT_ID}/commands"

    # Get command definitions from the handler
    handler = CommandHandler()
    commands = handler.get_command_definitions()

    # first, check if the commands already exist
    print(f"🤖: Checking existing commands at {url}")
    response = requests.get(url, headers=headers)

    if response.status_code == 401:
        print(f"🤖: 401 Unauthorized - Response: {response.text}")
        print("🤖: This usually means:")
        print("   1. The bot token is invalid or expired")
        print("   2. The bot doesn't have the 'applications.commands' scope")
        print("   3. The client ID is incorrect")
        print("   4. The bot hasn't been added to any servers")
        raise Exception(f"401 Unauthorized: {response.text}")

    try:
        response.raise_for_status()
    except Exception as e:
        print(f"🤖: Error checking commands: {response.status_code} - {response.text}")
        raise Exception(f"Failed to check existing commands: {e}") from e

    existing_commands = response.json()
    print(f"🤖: Found {len(existing_commands)} existing commands")

    # Map existing commands by name for quick lookup
    existing_by_name = {
        cmd.get("name"): cmd for cmd in existing_commands if cmd.get("name")
    }

    desired_names = {c["name"] for c in commands}

    if force:
        # Delete stale commands (those that exist remotely but no longer defined locally)
        stale = [
            cmd for name, cmd in existing_by_name.items() if name not in desired_names
        ]
        if stale:
            print(
                f"🤖: Deleting {len(stale)} stale command(s): {[c.get('name') for c in stale]}"
            )
        for cmd in stale:
            cmd_id = cmd.get("id")
            name = cmd.get("name")
            del_url = f"{url}/{cmd_id}"
            r = requests.delete(del_url, headers=headers)
            if r.status_code not in (200, 204):
                print(
                    f"🤖: ⚠️ Failed to delete stale command {name}: {r.status_code} - {r.text}"
                )
            else:
                print(f"🤖: 🗑️ Deleted stale command {name}")

    # Reconcile / create / update desired commands
    for command in commands:
        name = command["name"]
        existing = existing_by_name.get(name)

        if existing:
            if not force:
                print(
                    f"🤖: ✅ Command '{name}' already exists (skip; use --force to update)"
                )
                continue

            # PATCH existing command
            cmd_id = existing.get("id")
            patch_url = f"{url}/{cmd_id}"
            print(f"🤖: 🔄 Updating command '{name}' (id={cmd_id})")
            r = requests.patch(patch_url, headers=headers, json=command)
            if r.status_code == 401:
                raise Exception(
                    f"401 Unauthorized when updating command '{name}': {r.text}"
                )
            try:
                r.raise_for_status()
            except Exception as e:
                print(f"🤖: ❌ Error updating '{name}': {r.status_code} - {r.text}")
                raise Exception(f"Failed to update command '{name}': {e}") from e
            print(f"🤖: ✅ Updated command '{name}'")
        else:
            # Create new command
            print(f"🤖: ➕ Creating new command '{name}'")
            r = requests.post(url, headers=headers, json=command)
            if r.status_code == 401:
                raise Exception(
                    f"401 Unauthorized when creating command '{name}': {r.text}"
                )
            try:
                r.raise_for_status()
            except Exception as e:
                print(f"🤖: ❌ Error creating '{name}': {r.status_code} - {r.text}")
                raise Exception(f"Failed to create command '{name}': {e}") from e
            print(f"🤖: ✅ Created command '{name}'")

    if force:
        print(
            "🤖: Force sync complete — remote command set now matches local definitions."
        )
    else:
        print("🤖: Non-force registration complete — new commands (if any) created.")


@app.function(secrets=[discord_secret, supabase_secret], min_containers=1, image=image)
@modal.concurrent(max_inputs=1000)
@modal.asgi_app()
def web_app():
    """Main web application for handling Discord interactions."""
    import os
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware

    web_app = FastAPI()

    # must allow requests from other domains, e.g. from Discord's servers
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _is_cron_request_authorized(request: Request) -> bool:
        secret = os.getenv("VERCEL_CRON_SECRET")
        if not secret:
            return True

        auth_header = request.headers.get("Authorization")
        if auth_header:
            parts = auth_header.strip().split()
            if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1] == secret:
                return True
            if auth_header.strip() == secret:
                return True

        cron_header = request.headers.get("X-Cron-Secret") or request.headers.get(
            "X-Vercel-Cron-Secret"
        )
        if cron_header and cron_header.strip() == secret:
            return True

        query_secret = request.query_params.get("secret")
        if query_secret and query_secret.strip() == secret:
            return True

        return False

    @web_app.post("/api")
    async def get_api(request: Request):
        """Handle Discord interactions."""
        body = await request.body()

        # confirm this is a request from Discord
        DiscordAuth.verify_request(cast(dict, request.headers), body)

        print("🤖: parsing request")
        data = json.loads(body.decode())

        if data.get("type") == DiscordInteractionType.PING:
            print("🤖: acking PING from Discord during auth check")
            return {"type": DiscordResponseType.PONG}

        if data.get("type") == DiscordInteractionType.APPLICATION_COMMAND:
            print("🤖: handling slash command")
            app_id = data["application_id"]
            interaction_token = data["token"]
            command_name = data["data"]["name"]
            guild_id = data.get("guild_id")
            user_id = data.get("member", {}).get("user", {}).get("id")

            # Check if the command is from an allowed guild
            if guild_id and not CommandHandler().is_guild_authorized(guild_id):
                print(f"🤖: command from unauthorized guild: {guild_id}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_message()},
                    app_id,
                    interaction_token,
                )
                return {
                    "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                }

            # Always defer the response first to avoid timeout issues
            # Authorization checks will be done in the async functions
            print(f"🤖: deferring response for user {user_id} in guild {guild_id}")

            # Handle different commands asynchronously
            if command_name == "shorten":
                # Handle link shortening
                options = data["data"].get("options", [])
                url = None
                custom_slug = None

                for option in options:
                    if option["name"] == "url":
                        url = option["value"]
                    elif option["name"] == "custom_slug":
                        custom_slug = option["value"]

                if not url:
                    handler = CommandHandler()
                    await handler.discord_client.send_response(
                        {
                            "content": handler.discord_client.format_missing_url_message()
                        },
                        app_id,
                        interaction_token,
                    )
                    return {
                        "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                    }

                # kick off link shortening asynchronously, will handle authorization
                reply_shorten_link.spawn(
                    app_id, interaction_token, url, custom_slug or "", user_id, guild_id
                )
            elif command_name == "daily-report":
                # Extract options for daily-report command
                options = data["data"].get("options", [])
                # kick off daily report asynchronously, will handle authorization
                reply_daily_report.spawn(
                    app_id, interaction_token, options, user_id, guild_id
                )
            elif command_name == "tumeet":
                options = data["data"].get("options", [])
                reply_tumeet_plan.spawn(
                    app_id, interaction_token, options, user_id, guild_id
                )
            elif command_name == "ticket":
                reply_ticket.spawn(app_id, interaction_token, user_id, guild_id)
            elif command_name == "assign":
                options = data["data"].get("options", [])
                reply_assign.spawn(app_id, interaction_token, options, user_id, guild_id)
            elif command_name == "unassign":
                options = data["data"].get("options", [])
                reply_unassign.spawn(app_id, interaction_token, options, user_id, guild_id)
            elif command_name == "assignees":
                options = data["data"].get("options", [])
                reply_assignees.spawn(app_id, interaction_token, options, user_id, guild_id)
            elif command_name == "wol-reminder":
                reply_wol_reminder.spawn(app_id, interaction_token, user_id, guild_id)
            else:
                print(f"🤖: unknown command: {command_name}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {
                        "content": handler.discord_client.format_unknown_command_message(
                            command_name
                        )
                    },
                    app_id,
                    interaction_token,
                )

            # respond immediately with defer message
            return {"type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}

        if data.get("type") == DiscordInteractionType.MESSAGE_COMPONENT:
            print("🤖: handling component interaction")
            app_id = data["application_id"]
            interaction_token = data["token"]
            guild_id = data.get("guild_id")
            user_id = data.get("member", {}).get("user", {}).get("id")
            custom_id = data["data"]["custom_id"]

            print(f"🤖: component custom_id: {custom_id}")

            # Check if the interaction is from an allowed guild
            if guild_id and not CommandHandler().is_guild_authorized(guild_id):
                print(f"🤖: interaction from unauthorized guild: {guild_id}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_message()},
                    app_id,
                    interaction_token,
                )
                return {
                    "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                }

            print(
                f"🤖: deferring component interaction response from user {user_id} in guild {guild_id}"
            )

            # Handle different component interactions asynchronously
            # Support both legacy boards listing select id and ticket flow specific id
            if custom_id in ("select_board_for_lists", "select_board_for_ticket"):
                selected_board_id = data["data"]["values"][0]
                print(f"🤖: selected board ID: {selected_board_id}")
                handle_board_selection_interaction.spawn(
                    app_id, interaction_token, user_id, guild_id, selected_board_id
                )
            elif custom_id == "select_list_for_ticket":
                # Handle list selection synchronously to return modal
                selected_value = data["data"]["values"][0]
                print(f"🤖: selected list value: {selected_value}")

                try:
                    if "|" in selected_value:
                        board_id, list_id = selected_value.split("|", 1)
                    else:
                        # Fallback if format is unexpected
                        return {
                            "type": DiscordResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                            "data": {
                                "content": "❌ **Error:** Invalid list selection format.",
                                "flags": 64,  # EPHEMERAL flag
                            },
                        }
                    # Show modal immediately WITHOUT pre-checking user permissions/workspace.
                    # Authorization & workspace validation will be enforced on modal submission.
                    handler = CommandHandler()
                    modal_data = handler.create_ticket_form_modal(list_id, None)
                    return modal_data

                except Exception as e:
                    print(f"🤖: Error creating modal: {e}")
                    import traceback

                    traceback.print_exc()
                    return {
                        "type": DiscordResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        "data": {
                            "content": f"❌ **Error:** Failed to create ticket form: {str(e)}",
                            "flags": 64,  # EPHEMERAL flag
                        },
                    }
            else:
                print(f"🤖: unknown component interaction: {custom_id}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {"content": "Unknown interaction. Please try again."},
                    app_id,
                    interaction_token,
                )

            return {"type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}

        if data.get("type") == DiscordInteractionType.MODAL_SUBMIT:
            print("🤖: handling modal submission")
            app_id = data["application_id"]
            interaction_token = data["token"]
            guild_id = data.get("guild_id")
            user_id = data.get("member", {}).get("user", {}).get("id")
            custom_id = data["data"]["custom_id"]

            # Check if the interaction is from an allowed guild
            if guild_id and not CommandHandler().is_guild_authorized(guild_id):
                print(f"🤖: modal submission from unauthorized guild: {guild_id}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {"content": handler.discord_client.format_unauthorized_message()},
                    app_id,
                    interaction_token,
                )
                return {
                    "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                }

            print(
                f"🤖: deferring response for modal submission from user {user_id} in guild {guild_id}"
            )

            # Handle modal submissions asynchronously
            if custom_id.startswith("ticket_form|"):
                # Extract the board_id and list_id from the custom_id format: ticket_form|{board_id}|{list_id}
                parts = custom_id.split("|")
                if len(parts) >= 3:
                    # board_id = parts[1]
                    list_id = parts[2]
                    handle_ticket_modal_submission.spawn(
                        app_id,
                        interaction_token,
                        user_id,
                        guild_id,
                        list_id,
                        data["data"]["components"],
                    )
                else:
                    print(f"🤖: invalid modal custom_id format: {custom_id}")
                    handler = CommandHandler()
                    await handler.discord_client.send_response(
                        {"content": "Invalid form submission format."},
                        app_id,
                        interaction_token,
                    )
            else:
                print(f"🤖: unknown modal submission: {custom_id}")
                handler = CommandHandler()
                await handler.discord_client.send_response(
                    {"content": "Unknown modal submission. Please try again."},
                    app_id,
                    interaction_token,
                )

            return {"type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}

        print(f"🤖: unable to parse request with type {data.get('type')}")
        raise HTTPException(status_code=400, detail="Bad request")

    @web_app.api_route("/wol-reminder", methods=["GET", "POST"])
    async def wol_reminder_endpoint(request: Request):
        """Trigger the WOL reminder via cron or manual invocation."""
        if not _is_cron_request_authorized(request):
            raise HTTPException(status_code=401, detail="Unauthorized")

        from wol_reminder import trigger_wol_reminder
        from discord_client import DiscordAPIError, DiscordMissingAccessError

        try:
            result = await trigger_wol_reminder()
        except DiscordMissingAccessError as error:
            print(f"🤖: Cron WOL reminder missing access: {error}")
            raise HTTPException(
                status_code=403,
                detail=(
                    "Bot lacks access to the configured channel. Verify the channel ID and bot permissions."
                ),
            )
        except DiscordAPIError as error:
            print(f"🤖: Error executing WOL reminder: {error}")
            raise HTTPException(status_code=500, detail="Failed to send reminder")

        return {
            "status": "ok",
            "channel_id": result["channel_id"],
            "content_preview": result["content"],
            "mode": result.get("mode", "everyone"),
        }

    return web_app
