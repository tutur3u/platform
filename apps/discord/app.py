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
        "auth", "commands", "config", "discord_client", "link_shortener", "utils"
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
    ],
)


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def fetch_api() -> str:
    """Fetch random API data (legacy function for backward compatibility)."""
    handler = CommandHandler()
    return await handler._fetch_api_data()


@app.local_entrypoint()
def test_fetch_api():
    """Test the API wrapper."""
    result = fetch_api.remote()
    if result.startswith("# 🤖: Oops! "):  # type: ignore
        raise Exception(result)
    else:
        print(result)


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply(
    app_id: str, interaction_token: str, user_id: Optional[str] = None, guild_id: Optional[str] = None
):
    """Handle /api command with authorization."""
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
        print(f"🤖: Calling handle_api_command for user {user_id}")
        if user_info:
            await handler.handle_api_command(app_id, interaction_token, user_info)
        else:
            await handler.handle_api_command(app_id, interaction_token, None)  # type: ignore[arg-type]
        print(f"🤖: handle_api_command completed successfully")
    except Exception as e:
        print(f"🤖: Error in handle_api_command: {e}")
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
                app_id, interaction_token, options, None  # type: ignore[arg-type]
            )
        print(f"🤖: handle_shorten_command completed successfully")
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
    app_id: str, interaction_token: str, user_id: Optional[str] = None, guild_id: Optional[str] = None
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
        if user_info:
            await handler.handle_daily_report_command(app_id, interaction_token, user_info)
        else:
            await handler.handle_daily_report_command(app_id, interaction_token, None)  # type: ignore[arg-type]
        print(f"🤖: handle_daily_report_command completed successfully")
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
        print(f"🤖: ✅ Bot token is valid")
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
        print(f"🤖: ✅ Bot has applications.commands scope")
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
    existing_by_name = {cmd.get("name"): cmd for cmd in existing_commands if cmd.get("name")}

    desired_names = {c["name"] for c in commands}

    if force:
        # Delete stale commands (those that exist remotely but no longer defined locally)
        stale = [cmd for name, cmd in existing_by_name.items() if name not in desired_names]
        if stale:
            print(f"🤖: Deleting {len(stale)} stale command(s): {[c.get('name') for c in stale]}")
        for cmd in stale:
            cmd_id = cmd.get("id")
            name = cmd.get("name")
            del_url = f"{url}/{cmd_id}"
            r = requests.delete(del_url, headers=headers)
            if r.status_code not in (200, 204):
                print(f"🤖: ⚠️ Failed to delete stale command {name}: {r.status_code} - {r.text}")
            else:
                print(f"🤖: 🗑️ Deleted stale command {name}")

    # Reconcile / create / update desired commands
    for command in commands:
        name = command["name"]
        existing = existing_by_name.get(name)

        if existing:
            if not force:
                print(f"🤖: ✅ Command '{name}' already exists (skip; use --force to update)")
                continue

            # PATCH existing command
            cmd_id = existing.get("id")
            patch_url = f"{url}/{cmd_id}"
            print(f"🤖: 🔄 Updating command '{name}' (id={cmd_id})")
            r = requests.patch(patch_url, headers=headers, json=command)
            if r.status_code == 401:
                raise Exception(f"401 Unauthorized when updating command '{name}': {r.text}")
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
                raise Exception(f"401 Unauthorized when creating command '{name}': {r.text}")
            try:
                r.raise_for_status()
            except Exception as e:
                print(f"🤖: ❌ Error creating '{name}': {r.status_code} - {r.text}")
                raise Exception(f"Failed to create command '{name}': {e}") from e
            print(f"🤖: ✅ Created command '{name}'")

    if force:
        print("🤖: Force sync complete — remote command set now matches local definitions.")
    else:
        print("🤖: Non-force registration complete — new commands (if any) created.")


@app.function(secrets=[discord_secret, supabase_secret], min_containers=1, image=image)
@modal.concurrent(max_inputs=1000)
@modal.asgi_app()
def web_app():
    """Main web application for handling Discord interactions."""
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
            if command_name == "api":
                # kick off request asynchronously, will handle authorization
                reply.spawn(app_id, interaction_token, user_id, guild_id)
            elif command_name == "shorten":
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
                # kick off daily report asynchronously, will handle authorization
                reply_daily_report.spawn(app_id, interaction_token, user_id, guild_id)
            elif command_name == "tumeet":
                options = data["data"].get("options", [])
                reply_tumeet_plan.spawn(
                    app_id, interaction_token, options, user_id, guild_id
                )
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

        print(f"🤖: unable to parse request with type {data.get('type')}")
        raise HTTPException(status_code=400, detail="Bad request")

    return web_app
