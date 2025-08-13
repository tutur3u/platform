# Discord Bot

A Discord bot that provides information about random free, public APIs and shortens URLs using slash commands.

## Features

- **API Information**: Get information about random free, public APIs
- **Link Shortener**: Shorten URLs with optional custom slugs
- **Guild Restriction**: Only works in authorized Discord servers
- **Modular Architecture**: Clean, maintainable code structure

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

**Note**: This bot is restricted to specific Discord servers. Only servers with the following IDs are authorized:

- `1333469478431756370`
- `1010094422156918854`

### 3. Set up Modal Secrets

Create two Modal secrets:

#### Discord Secret (`discord-secret`)

- `DISCORD_BOT_TOKEN`: Your bot token from step 1
- `DISCORD_CLIENT_ID`: Your application ID from step 1
- `DISCORD_PUBLIC_KEY`: Your application's public key (found in General Information)

#### Supabase Secret (`supabase-secret`)

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (found in Project Settings > API)

### 4. Deploy and Test

```bash
# Test the API wrapper
modal run app.py

# Test bot token and permissions
modal run app.py::test_bot_token

# Create the slash commands (if missing)
modal run app.py::create_slash_command

# Force recreate slash commands (if needed)
modal run app.py::create_slash_command --force

# Deploy the web app
modal deploy app.py
```

## Project Structure

```
apps/discord/
├── app.py              # Main application entry point
├── config.py           # Configuration constants and settings
├── utils.py            # Utility functions (URL validation, slug generation)
├── auth.py             # Discord request authentication
├── discord_client.py   # Discord API client and message formatting
├── commands.py         # Command definitions and handlers
├── link_shortener.py   # Link shortening functionality
└── README.md           # This file
```

## Commands

### `/api`

Get information about a random free, public API.

### `/shorten`

Shorten a URL with an optional custom slug.

**Parameters:**

- `url` (required): The URL to shorten
- `custom_slug` (optional): Custom slug for the shortened URL

**Examples:**

```
/shorten url:https://example.com/very-long-url
/shorten url:https://example.com/very-long-url custom_slug:my-link
```

**Response:**

```
🔗 Link Shortened Successfully!

Original URL: https://example.com/very-long-url
Shortened URL: https://tuturuuu.com/s/abc123
Slug: abc123
```

## Troubleshooting

### 401 Unauthorized Error

If you get a 401 error when creating slash commands:

1. **Check your bot token**: Make sure it's valid and not expired
2. **Verify CLIENT_ID**: Use the Application ID, not the bot's user ID
3. **Check bot permissions**: Ensure the bot has the `applications.commands` scope
4. **Server invitation**: Make sure the bot has been added to at least one server
5. **Bot token format**: Ensure the token starts with the correct format

### Link Shortener Issues

1. **Supabase configuration**: Ensure both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly
2. **Database permissions**: Make sure the service role key has access to the `shortened_links` table
3. **URL validation**: Ensure the URL includes the protocol (http:// or https://)

### Guild Restriction Issues

1. **Bot not responding**: The bot only works in authorized Discord servers
2. **Unauthorized server**: If you see "This bot is not available in this server", the server ID is not in the allowed list
3. **Adding new servers**: Contact the bot administrator to add new server IDs to the `ALLOWED_GUILD_IDS` list

### Common Issues

- **Wrong CLIENT_ID**: Use the Application ID from General Information, not the bot's user ID
- **Missing secrets**: Ensure both Discord and Supabase secrets are properly configured
- **Invalid URLs**: URLs must include the protocol and be properly formatted
