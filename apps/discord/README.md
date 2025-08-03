# Discord Bot

A Discord bot that provides information about random free, public APIs using slash commands.

## Setup

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this later)
5. Go to the "General Information" section and copy the Application ID (this is your CLIENT_ID)

### 2. Configure Bot Permissions

1. In the "Bot" section, enable these permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History

2. Go to "OAuth2" → "URL Generator"
3. Select scopes:
   - `bot`
   - `applications.commands`
4. Select bot permissions:
   - Send Messages
   - Use Slash Commands
5. Copy the generated URL and use it to invite the bot to your server

### 3. Set up Modal Secrets

Create a Modal secret named `discord-secret` with these keys:

- `DISCORD_BOT_TOKEN`: Your bot token from step 1
- `DISCORD_CLIENT_ID`: Your application ID from step 1
- `DISCORD_PUBLIC_KEY`: Your application's public key (found in General Information)

### 4. Deploy and Test

```bash
# Test the API wrapper
modal run app.py

# Test bot token and permissions
modal run app.py::test_bot_token

# Create the slash command (if missing)
modal run app.py::create_slash_command

# Deploy the web app
modal deploy app.py
```

## Troubleshooting

### 401 Unauthorized Error

If you get a 401 error when creating slash commands:

1. **Check your bot token**: Make sure it's valid and not expired
2. **Verify CLIENT_ID**: Use the Application ID, not the bot's user ID
3. **Check bot permissions**: Ensure the bot has the `applications.commands` scope
4. **Server invitation**: Make sure the bot has been added to at least one server
5. **Bot token format**: Ensure the token starts with the correct format

### Common Issues

- **Wrong CLIENT_ID**: Use the Application ID from General Information, not the bot's user ID
- **Missing scope**: The bot invite URL must include `applications.commands` scope
- **Bot not in server**: The bot must be added to at least one server to create commands
- **Invalid token**: Regenerate the bot token if it's been compromised

### Testing Commands

```bash
# Test the API wrapper
modal run app.py

# Test bot authentication
modal run app.py::test_bot_token

# Force recreate slash command
modal run app.py::create_slash_command --force
```

## API Reference

- `GET /api` - Discord interaction endpoint
- `/api` slash command - Returns information about a random free API
