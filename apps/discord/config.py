"""Configuration settings for the Discord bot."""

# Allowed Discord guild IDs
ALLOWED_GUILD_IDS = ["1333469478431756370", "1010094422156918854"]

# Default workspace ID for link shortener
DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000"

# Discord bot user ID (placeholder)
DISCORD_BOT_USER_ID = "00000000-0000-0000-0000-000000000000"

# Slug generation settings
DEFAULT_SLUG_LENGTH = 6
MAX_SLUG_LENGTH = 50
MAX_SLUG_ATTEMPTS = 10

# URL settings
PRODUCTION_BASE_URL = "https://tuturuuu.com"
DEV_BASE_URL = "http://localhost:3002"


# Discord interaction types
class DiscordInteractionType:
    PING = 1
    APPLICATION_COMMAND = 2


# Discord response types
class DiscordResponseType:
    PONG = 1
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5
