"""Main Discord bot application."""

import json

import modal
from auth import DiscordAuth
from commands import CommandHandler
from config import DiscordInteractionType, DiscordResponseType

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install("fastapi[standard]", "pynacl", "requests", "supabase", "nanoid")
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
async def reply(app_id: str, interaction_token: str, user_info: dict = None):
    """Handle /api command (legacy function for backward compatibility)."""
    handler = CommandHandler()
    await handler.handle_api_command(app_id, interaction_token, user_info)


@app.function(secrets=[supabase_secret], image=image)
@modal.concurrent(max_inputs=1000)
async def reply_shorten_link(
    app_id: str,
    interaction_token: str,
    url: str,
    custom_slug: str = None,
    user_info: dict = None,
):
    """Handle link shortening (legacy function for backward compatibility)."""
    handler = CommandHandler()
    options = [{"name": "url", "value": url}]
    if custom_slug:
        options.append({"name": "custom_slug", "value": custom_slug})

    await handler.handle_shorten_command(app_id, interaction_token, options, user_info)


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
    """Registers the slash commands with Discord. Pass the force flag to re-register."""
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

    # Check which commands exist
    existing_command_names = {cmd.get("name") for cmd in existing_commands}

    for command in commands:
        command_name = command["name"]
        command_exists = command_name in existing_command_names

        # and only recreate it if the force flag is set
        if command_exists and not force:
            print(f"🤖: command {command_name} exists")
            continue

        print(f"🤖: Creating command {command_name}")
        response = requests.post(url, headers=headers, json=command)

        if response.status_code == 401:
            print(
                f"🤖: 401 Unauthorized when creating command - Response: {response.text}"
            )
            raise Exception(f"401 Unauthorized when creating command: {response.text}")

        try:
            response.raise_for_status()
        except Exception as e:
            print(
                f"🤖: Error creating command: {response.status_code} - {response.text}"
            )
            raise Exception(f"Failed to create slash command: {e}") from e

        print(f"🤖: command {command_name} created successfully")


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
        DiscordAuth.verify_request(request.headers, body)

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

            # Check if the user is authorized to use commands
            if user_id:
                handler = CommandHandler()

                # For guild commands, check guild + user authorization
                if guild_id:
                    if not handler.is_user_authorized(user_id, guild_id):
                        print(
                            f"🤖: command from unauthorized user: {user_id} in guild: {guild_id}"
                        )
                        await handler.discord_client.send_response(
                            {
                                "content": handler.discord_client.format_unauthorized_user_message()
                            },
                            app_id,
                            interaction_token,
                        )
                        return {
                            "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                        }
                else:
                    # For DM commands, check if user is linked to any workspace with Discord integration
                    if not handler.is_user_authorized_for_dm(user_id):
                        print(f"🤖: command from unauthorized user in DM: {user_id}")
                        await handler.discord_client.send_response(
                            {
                                "content": handler.discord_client.format_unauthorized_user_message()
                            },
                            app_id,
                            interaction_token,
                        )
                        return {
                            "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
                        }

                # Log user info for debugging
                user_info = handler.get_user_workspace_info(user_id, guild_id)
                if user_info:
                    print(
                        f"🤖: authorized user {user_id} ({user_info.get('display_name', 'Unknown')}) from workspace {user_info.get('workspace_id')}"
                    )
                else:
                    print(f"🤖: user {user_id} authorized but no workspace info found")

            # Handle different commands
            handler = CommandHandler()

            # Get user info for command context (already retrieved above)
            user_info = None
            if user_id:
                user_info = handler.get_user_workspace_info(user_id, guild_id)

            if command_name == "api":
                # kick off request asynchronously, will respond when ready
                reply.spawn(app_id, interaction_token, user_info)
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

                # kick off link shortening asynchronously
                reply_shorten_link.spawn(
                    app_id, interaction_token, url, custom_slug, user_info
                )
            else:
                print(f"🤖: unknown command: {command_name}")
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
