import json
from enum import Enum

import modal

image = modal.Image.debian_slim(python_version="3.13").pip_install(
    "fastapi[standard]", "pynacl", "requests"
)

app = modal.App("tuturuuu-discord-bot", image=image)


@app.function()
@modal.concurrent(max_inputs=1000)
async def fetch_api() -> str:
    import aiohttp

    url = "https://www.freepublicapis.com/api/random"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url) as response:
                response.raise_for_status()
                data = await response.json()
                message = (
                    f"# {data.get('emoji') or '🤖'} [{data['title']}]({data['source']})"
                )
                message += f"\n _{''.join(data['description'].splitlines())}_"
        except Exception as e:
            message = f"# 🤖: Oops! {e}"

    return message


@app.local_entrypoint()
def test_fetch_api():
    result = fetch_api.remote()
    if result.startswith("# 🤖: Oops! "):  # type: ignore
        raise Exception(result)
    else:
        print(result)


async def send_to_discord(payload: dict, app_id: str, interaction_token: str):
    import aiohttp

    interaction_url = f"https://discord.com/api/v10/webhooks/{app_id}/{interaction_token}/messages/@original"

    async with aiohttp.ClientSession() as session:
        async with session.patch(interaction_url, json=payload) as resp:
            print("🤖 Discord response: " + await resp.text())


@app.function()
@modal.concurrent(max_inputs=1000)
async def reply(app_id: str, interaction_token: str):
    message = await fetch_api.local()
    await send_to_discord({"content": message}, app_id, interaction_token)


discord_secret = modal.Secret.from_name(
    "discord-secret",
    required_keys=[  # included so we get nice error messages if we forgot a key
        "DISCORD_BOT_TOKEN",
        "DISCORD_CLIENT_ID",
        "DISCORD_PUBLIC_KEY",
    ],
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


@app.function(secrets=[discord_secret], image=image)
def create_slash_command(force: bool = False):
    """Registers the slash command with Discord. Pass the force flag to re-register."""
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

    command_description = {
        "name": "api",
        "description": "Information about a random free, public API",
    }

    # first, check if the command already exists
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

    commands = response.json()
    print(f"🤖: Found {len(commands)} existing commands")
    command_exists = any(
        command.get("name") == command_description["name"] for command in commands
    )

    # and only recreate it if the force flag is set
    if command_exists and not force:
        print(f"🤖: command {command_description['name']} exists")
        return

    print(f"🤖: Creating command {command_description['name']}")
    response = requests.post(url, headers=headers, json=command_description)

    if response.status_code == 401:
        print(f"🤖: 401 Unauthorized when creating command - Response: {response.text}")
        raise Exception(f"401 Unauthorized when creating command: {response.text}")

    try:
        response.raise_for_status()
    except Exception as e:
        print(f"🤖: Error creating command: {response.status_code} - {response.text}")
        raise Exception(f"Failed to create slash command: {e}") from e

    print(f"🤖: command {command_description['name']} created successfully")


@app.function(secrets=[discord_secret], min_containers=1)
@modal.concurrent(max_inputs=1000)
@modal.asgi_app()
def web_app():
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
        body = await request.body()

        # confirm this is a request from Discord
        authenticate(request.headers, body)

        print("🤖: parsing request")
        data = json.loads(body.decode())
        if data.get("type") == DiscordInteractionType.PING.value:
            print("🤖: acking PING from Discord during auth check")
            return {"type": DiscordResponseType.PONG.value}

        if data.get("type") == DiscordInteractionType.APPLICATION_COMMAND.value:
            print("🤖: handling slash command")
            app_id = data["application_id"]
            interaction_token = data["token"]

            # kick off request asynchronously, will respond when ready
            reply.spawn(app_id, interaction_token)

            # respond immediately with defer message
            return {
                "type": DiscordResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE.value
            }

        print(f"🤖: unable to parse request with type {data.get('type')}")
        raise HTTPException(status_code=400, detail="Bad request")

    return web_app


def authenticate(headers, body):
    import os

    from fastapi.exceptions import HTTPException
    from nacl.exceptions import BadSignatureError
    from nacl.signing import VerifyKey

    print("🤖: authenticating request")
    # verify the request is from Discord using their public key
    public_key = os.getenv("DISCORD_PUBLIC_KEY")

    if not public_key:
        raise HTTPException(status_code=500, detail="DISCORD_PUBLIC_KEY is not set")

    verify_key = VerifyKey(bytes.fromhex(public_key))

    signature = headers.get("X-Signature-Ed25519")
    timestamp = headers.get("X-Signature-Timestamp")

    message = timestamp.encode() + body

    try:
        verify_key.verify(message, bytes.fromhex(signature))
    except BadSignatureError:
        # either an unauthorized request or Discord's "negative control" check
        raise HTTPException(status_code=401, detail="Invalid request")


class DiscordInteractionType(Enum):
    PING = 1  # hello from Discord during auth check
    APPLICATION_COMMAND = 2  # an actual command


class DiscordResponseType(Enum):
    PONG = 1  # hello back during auth check
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5  # we'll send a message later
