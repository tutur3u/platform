import pytest

from ai_agent_gateway_watcher import (
    WatcherConfig,
    WatcherTarget,
    build_forwarded_gateway_event,
    forward_gateway_packet,
    forward_gateway_packet_to_targets,
    gateway_packet_matches_target,
    resolve_watcher_targets,
    resolve_watcher_webhook_urls,
)


def test_build_forwarded_gateway_event_wraps_raw_discord_packets():
    event = build_forwarded_gateway_event(
        {
            "d": {"channel_id": "discord-channel-1", "content": "hello"},
            "op": 0,
            "s": 42,
            "t": "MESSAGE_CREATE",
        },
        timestamp_ms=1_718_000_000_000,
    )

    assert event == {
        "data": {"channel_id": "discord-channel-1", "content": "hello"},
        "timestamp": 1_718_000_000_000,
        "type": "GATEWAY_MESSAGE_CREATE",
    }


def test_build_forwarded_gateway_event_ignores_packets_without_event_type():
    assert build_forwarded_gateway_event({"op": 10, "d": {}}) is None


def test_watcher_config_uses_ai_agent_token_before_legacy_bot_token():
    env = {
        "DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN": "agent-token",
        "DISCORD_AI_AGENT_GATEWAY_WEBHOOK_URL": "https://example.com/webhook",
        "DISCORD_BOT_TOKEN": "legacy-token",
    }
    config = WatcherConfig.from_env(env)

    assert config.bot_token == env["DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN"]
    assert config.webhook_url == env["DISCORD_AI_AGENT_GATEWAY_WEBHOOK_URL"]
    assert config.webhook_urls == (env["DISCORD_AI_AGENT_GATEWAY_WEBHOOK_URL"],)


def test_watcher_config_can_auto_resolve_from_apps_web():
    env = {
        "DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN": "agent-token",
        "DISCORD_AI_AGENT_GATEWAY_CHANNEL_ID": "root-discord",
        "DISCORD_AI_AGENT_GATEWAY_PLATFORM_URL": "tuturuuu.com/",
        "DISCORD_AI_AGENT_GATEWAY_WATCHER_SECRET": "watcher-secret",
    }
    config = WatcherConfig.from_env(env)

    assert config.bot_token == env["DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN"]
    assert config.platform_url == "https://tuturuuu.com"
    assert config.target_channel_id == "root-discord"
    assert config.watcher_secret == env["DISCORD_AI_AGENT_GATEWAY_WATCHER_SECRET"]
    assert config.webhook_urls == ()
    assert (
        config.watcher_config_url() == "https://tuturuuu.com/api/v1/infrastructure/ai-agents/"
        "discord-gateway/watcher-config?channelId=root-discord"
    )


class _Response:
    status = 204

    async def text(self):
        return ""


class _PostContext:
    def __init__(self, calls, *args, **kwargs):
        self.calls = calls
        self.args = args
        self.kwargs = kwargs

    async def __aenter__(self):
        self.calls.append((self.args, self.kwargs))
        return _Response()

    async def __aexit__(self, _exc_type, _exc, _tb):
        return None


class _GetResponse:
    status = 200

    async def json(self):
        return {
            "targets": [
                {
                    "channelId": "root-discord",
                    "discordGuildId": "guild-1",
                    "externalChannelId": "discord-channel-1",
                    "webhookUrl": "https://example.com/webhook/root-discord",
                    "workspaceId": "00000000-0000-0000-0000-000000000000",
                },
                {
                    "channelId": "unscoped-root-discord",
                    "webhookUrl": "https://example.com/webhook/unscoped-root-discord",
                    "workspaceId": "00000000-0000-0000-0000-000000000000",
                },
            ]
        }

    async def text(self):
        return ""


class _GetContext:
    def __init__(self, calls, *args, **kwargs):
        self.calls = calls
        self.args = args
        self.kwargs = kwargs

    async def __aenter__(self):
        self.calls.append((self.args, self.kwargs))
        return _GetResponse()

    async def __aexit__(self, _exc_type, _exc, _tb):
        return None


class _Session:
    def __init__(self):
        self.calls = []

    def post(self, *args, **kwargs):
        return _PostContext(self.calls, *args, **kwargs)

    def get(self, *args, **kwargs):
        return _GetContext(self.calls, *args, **kwargs)


@pytest.mark.asyncio
async def test_forward_gateway_packet_posts_chat_sdk_gateway_contract():
    session = _Session()
    credential = "bot-token"

    forwarded = await forward_gateway_packet(
        bot_token=credential,
        packet={"d": {"id": "message-1"}, "op": 0, "t": "MESSAGE_CREATE"},
        session=session,
        webhook_url="https://example.com/webhook",
        timestamp_ms=1_718_000_000_000,
    )

    assert forwarded is True
    [(args, kwargs)] = session.calls
    assert args == ("https://example.com/webhook",)
    assert kwargs == {
        "headers": {
            "Content-Type": "application/json",
            "x-discord-gateway-token": credential,
        },
        "json": {
            "data": {"id": "message-1"},
            "timestamp": 1_718_000_000_000,
            "type": "GATEWAY_MESSAGE_CREATE",
        },
    }


@pytest.mark.asyncio
async def test_resolve_watcher_webhook_urls_uses_apps_web_config_endpoint():
    session = _Session()
    credential = "bot-token"
    watcher_credential = "watcher-secret"
    config = WatcherConfig(
        bot_token=credential,
        platform_url="https://tuturuuu.com",
        target_channel_id="root-discord",
        watcher_secret=watcher_credential,
    )

    webhook_urls = await resolve_watcher_webhook_urls(
        config=config,
        session=session,
    )

    assert webhook_urls == ("https://example.com/webhook/root-discord",)
    [(args, kwargs)] = session.calls
    assert args == (
        "https://tuturuuu.com/api/v1/infrastructure/ai-agents/"
        "discord-gateway/watcher-config?channelId=root-discord",
    )
    assert kwargs == {"headers": {"Authorization": f"Bearer {watcher_credential}"}}


@pytest.mark.asyncio
async def test_resolve_watcher_targets_preserves_apps_web_discord_scope():
    session = _Session()
    credential = "bot-token"
    watcher_credential = "watcher-secret"
    config = WatcherConfig(
        bot_token=credential,
        platform_url="https://tuturuuu.com",
        target_channel_id="root-discord",
        watcher_secret=watcher_credential,
    )

    targets = await resolve_watcher_targets(
        config=config,
        session=session,
    )

    assert targets == (
        WatcherTarget(
            discord_guild_id="guild-1",
            external_channel_id="discord-channel-1",
            webhook_url="https://example.com/webhook/root-discord",
        ),
    )


def test_gateway_packet_matches_configured_target_scope():
    target = WatcherTarget(
        discord_guild_id="guild-1",
        external_channel_id="discord-channel-1",
        webhook_url="https://example.com/webhook/root-discord",
    )

    assert gateway_packet_matches_target(
        {
            "d": {
                "channel_id": "thread-1",
                "guild_id": "guild-1",
                "thread": {"parent_id": "discord-channel-1"},
            },
            "op": 0,
            "t": "MESSAGE_CREATE",
        },
        target,
    )
    assert not gateway_packet_matches_target(
        {
            "d": {"channel_id": "other-channel", "guild_id": "guild-1"},
            "op": 0,
            "t": "MESSAGE_CREATE",
        },
        target,
    )


@pytest.mark.asyncio
async def test_forward_gateway_packet_to_targets_posts_each_webhook_url():
    session = _Session()
    credential = "bot-token"

    forwarded = await forward_gateway_packet_to_targets(
        bot_token=credential,
        packet={"d": {"id": "message-1"}, "op": 0, "t": "MESSAGE_CREATE"},
        session=session,
        webhook_urls=(
            "https://example.com/webhook/root-discord",
            "https://example.com/webhook/secondary-root-discord",
        ),
        timestamp_ms=1_718_000_000_000,
    )

    assert forwarded is True
    assert [args for args, _kwargs in session.calls] == [
        ("https://example.com/webhook/root-discord",),
        ("https://example.com/webhook/secondary-root-discord",),
    ]


@pytest.mark.asyncio
async def test_forward_gateway_packet_to_targets_skips_unmatched_discord_scope():
    session = _Session()
    credential = "bot-token"

    forwarded = await forward_gateway_packet_to_targets(
        bot_token=credential,
        packet={
            "d": {"channel_id": "other-channel", "guild_id": "guild-1"},
            "op": 0,
            "t": "MESSAGE_CREATE",
        },
        session=session,
        targets=(
            WatcherTarget(
                discord_guild_id="guild-1",
                external_channel_id="discord-channel-1",
                webhook_url="https://example.com/webhook/root-discord",
            ),
        ),
        timestamp_ms=1_718_000_000_000,
    )

    assert forwarded is False
    assert session.calls == []
