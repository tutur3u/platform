"""Self-hosted Discord Gateway watcher for apps/web AI-agent channels."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import aiohttp

logger = logging.getLogger(__name__)

DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json"
WATCHER_CONFIG_PATH = "/api/v1/infrastructure/ai-agents/discord-gateway/watcher-config"
DISCORD_GATEWAY_INTENTS = (
    1  # Guilds
    | 512  # GuildMessages
    | 1024  # GuildMessageReactions
    | 4096  # DirectMessages
    | 8192  # DirectMessageReactions
    | 32768  # MessageContent
)


def _split_urls(value: str | None) -> tuple[str, ...]:
    return tuple(
        entry.strip() for entry in (value or "").replace("\n", ",").split(",") if entry.strip()
    )


def _normalize_platform_url(value: str | None) -> str | None:
    normalized = (value or "").strip().rstrip("/")
    if not normalized:
        return None

    if "://" not in normalized:
        normalized = f"https://{normalized}"

    return normalized


@dataclass(frozen=True)
class WatcherConfig:
    """Runtime settings for forwarding Discord Gateway events to apps/web."""

    bot_token: str
    webhook_urls: tuple[str, ...] = ()
    gateway_url: str = DISCORD_GATEWAY_URL
    platform_url: str | None = None
    reconnect_delay_seconds: float = 5.0
    target_channel_id: str | None = None
    watcher_secret: str | None = None

    @property
    def webhook_url(self) -> str:
        return self.webhook_urls[0] if self.webhook_urls else ""

    @classmethod
    def from_env(cls, env: Mapping[str, str | None] | None = None) -> WatcherConfig:
        values = os.environ if env is None else env
        bot_token = (
            values.get("DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN")
            or values.get("DISCORD_BOT_TOKEN")
            or ""
        ).strip()
        webhook_urls = _split_urls(values.get("DISCORD_AI_AGENT_GATEWAY_WEBHOOK_URL"))
        platform_url = _normalize_platform_url(
            values.get("DISCORD_AI_AGENT_GATEWAY_PLATFORM_URL")
            or values.get("WEB_APP_URL")
            or values.get("NEXT_PUBLIC_WEB_APP_URL")
        )
        watcher_secret = (
            values.get("DISCORD_AI_AGENT_GATEWAY_WATCHER_SECRET") or ""
        ).strip() or None
        target_channel_id = (
            values.get("DISCORD_AI_AGENT_GATEWAY_CHANNEL_ID") or ""
        ).strip() or None

        if not bot_token:
            raise ValueError("DISCORD_AI_AGENT_GATEWAY_BOT_TOKEN is required")
        if not webhook_urls and not (platform_url and watcher_secret):
            raise ValueError(
                "DISCORD_AI_AGENT_GATEWAY_WEBHOOK_URL or "
                "DISCORD_AI_AGENT_GATEWAY_PLATFORM_URL with "
                "DISCORD_AI_AGENT_GATEWAY_WATCHER_SECRET is required"
            )

        return cls(
            bot_token=bot_token,
            gateway_url=(values.get("DISCORD_AI_AGENT_GATEWAY_URL") or "").strip()
            or DISCORD_GATEWAY_URL,
            platform_url=platform_url,
            target_channel_id=target_channel_id,
            watcher_secret=watcher_secret,
            webhook_urls=webhook_urls,
        )

    def watcher_config_url(self) -> str:
        if not self.platform_url:
            raise ValueError("DISCORD_AI_AGENT_GATEWAY_PLATFORM_URL is required")

        url = f"{self.platform_url}{WATCHER_CONFIG_PATH}"

        if self.target_channel_id:
            url = f"{url}?{urlencode({'channelId': self.target_channel_id})}"

        return url


@dataclass(frozen=True)
class WatcherTarget:
    """apps/web AI-agent webhook target with optional Discord scope metadata."""

    webhook_url: str
    discord_guild_id: str | None = None
    external_channel_id: str | None = None


def build_forwarded_gateway_event(
    packet: Mapping[str, Any], timestamp_ms: int | None = None
) -> dict[str, Any] | None:
    """Build the Gateway forwarding envelope accepted by Chat SDK Discord."""

    event_type = packet.get("t")
    if not event_type:
        return None

    return {
        "data": packet.get("d") or {},
        "timestamp": timestamp_ms if timestamp_ms is not None else int(time.time() * 1000),
        "type": f"GATEWAY_{event_type}",
    }


def _string_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _packet_channel_ids(data: Mapping[str, Any]) -> set[str]:
    channel_ids = set()
    direct_channel_id = _string_value(data.get("channel_id"))
    thread = data.get("thread")
    parent_channel_id = (
        _string_value(thread.get("parent_id")) if isinstance(thread, Mapping) else None
    )

    if direct_channel_id:
        channel_ids.add(direct_channel_id)
    if parent_channel_id:
        channel_ids.add(parent_channel_id)

    return channel_ids


def gateway_packet_matches_target(packet: Mapping[str, Any], target: WatcherTarget) -> bool:
    data = packet.get("d")

    if not target.discord_guild_id and not target.external_channel_id:
        return True

    if not isinstance(data, Mapping):
        return False

    if target.discord_guild_id and _string_value(data.get("guild_id")) != target.discord_guild_id:
        return False

    return not (
        target.external_channel_id and target.external_channel_id not in _packet_channel_ids(data)
    )


async def forward_gateway_packet(
    *,
    bot_token: str,
    packet: Mapping[str, Any],
    session: Any,
    webhook_url: str,
    timestamp_ms: int | None = None,
) -> bool:
    """Forward one raw Discord Gateway packet to the apps/web AI-agent webhook."""

    event = build_forwarded_gateway_event(packet, timestamp_ms=timestamp_ms)
    if event is None:
        return False

    async with session.post(
        webhook_url,
        headers={
            "Content-Type": "application/json",
            "x-discord-gateway-token": bot_token,
        },
        json=event,
    ) as response:
        if 200 <= response.status < 300:
            return True

        logger.error(
            "Failed to forward Discord Gateway event",
            extra={
                "event_type": event["type"],
                "response": await response.text(),
                "status": response.status,
            },
        )
        return False


async def resolve_watcher_webhook_urls(
    *,
    config: WatcherConfig,
    session: Any,
) -> tuple[str, ...]:
    """Resolve apps/web webhook URLs for root-internal deployed Discord targets."""

    targets = await resolve_watcher_targets(config=config, session=session)
    return tuple(target.webhook_url for target in targets)


async def resolve_watcher_targets(
    *,
    config: WatcherConfig,
    session: Any,
) -> tuple[WatcherTarget, ...]:
    """Resolve apps/web webhook targets for root-internal deployed Discord channels."""

    if config.webhook_urls:
        return tuple(WatcherTarget(webhook_url=url) for url in config.webhook_urls)

    if not config.watcher_secret:
        raise ValueError("DISCORD_AI_AGENT_GATEWAY_WATCHER_SECRET is required")

    async with session.get(
        config.watcher_config_url(),
        headers={"Authorization": f"Bearer {config.watcher_secret}"},
    ) as response:
        if not 200 <= response.status < 300:
            raise RuntimeError(
                "Failed to resolve Discord Gateway watcher configuration: "
                f"{response.status} {await response.text()}"
            )

        payload = await response.json()

    targets = payload.get("targets") if isinstance(payload, dict) else None
    watcher_targets = tuple(
        WatcherTarget(
            discord_guild_id=target.get("discordGuildId"),
            external_channel_id=target.get("externalChannelId"),
            webhook_url=target["webhookUrl"],
        )
        for target in targets or []
        if isinstance(target, dict)
        and isinstance(target.get("webhookUrl"), str)
        and isinstance(target.get("discordGuildId"), str)
        and isinstance(target.get("externalChannelId"), str)
    )

    if not watcher_targets:
        raise RuntimeError("Discord Gateway watcher configuration did not return webhook targets")

    return watcher_targets


async def forward_gateway_packet_to_targets(
    *,
    bot_token: str,
    packet: Mapping[str, Any],
    session: Any,
    targets: Sequence[WatcherTarget] | None = None,
    webhook_urls: Sequence[str] | None = None,
    timestamp_ms: int | None = None,
) -> bool:
    """Forward one Gateway packet to every configured apps/web webhook target."""

    forwarded = False
    resolved_targets = tuple(targets or ()) or tuple(
        WatcherTarget(webhook_url=url) for url in webhook_urls or ()
    )

    for target in resolved_targets:
        if not gateway_packet_matches_target(packet, target):
            continue

        forwarded = (
            await forward_gateway_packet(
                bot_token=bot_token,
                packet=packet,
                session=session,
                webhook_url=target.webhook_url,
                timestamp_ms=timestamp_ms,
            )
            or forwarded
        )

    return forwarded


class DiscordAiAgentGatewayWatcher:
    """Connects to Discord Gateway and forwards raw events to apps/web."""

    def __init__(self, config: WatcherConfig):
        self.config = config
        self._last_sequence: int | None = None

    async def run_forever(self) -> None:
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Discord AI-agent Gateway watcher crashed")

            await asyncio.sleep(self.config.reconnect_delay_seconds)

    async def run_once(self) -> None:
        async with (
            aiohttp.ClientSession() as session,
            session.ws_connect(self.config.gateway_url) as ws,
        ):
            targets = await resolve_watcher_targets(
                config=self.config,
                session=session,
            )
            hello = await ws.receive_json()
            heartbeat_interval_ms = hello.get("d", {}).get("heartbeat_interval", 45_000)
            heartbeat_task = asyncio.create_task(self._heartbeat(ws, heartbeat_interval_ms / 1000))

            try:
                await ws.send_json(
                    {
                        "d": {
                            "intents": DISCORD_GATEWAY_INTENTS,
                            "properties": {
                                "browser": "tuturuuu-ai-agent-watcher",
                                "device": "tuturuuu-ai-agent-watcher",
                                "os": "tuturuuu",
                            },
                            "token": self.config.bot_token,
                        },
                        "op": 2,
                    }
                )

                async for message in ws:
                    if message.type == aiohttp.WSMsgType.TEXT:
                        packet = message.json()
                        sequence = packet.get("s")
                        if isinstance(sequence, int):
                            self._last_sequence = sequence

                        await forward_gateway_packet_to_targets(
                            bot_token=self.config.bot_token,
                            packet=packet,
                            session=session,
                            targets=targets,
                        )
                    elif message.type in {
                        aiohttp.WSMsgType.CLOSED,
                        aiohttp.WSMsgType.ERROR,
                    }:
                        break
            finally:
                heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat_task

    async def _heartbeat(self, ws: aiohttp.ClientWebSocketResponse, delay: float) -> None:
        while True:
            await asyncio.sleep(delay)
            await ws.send_json({"d": self._last_sequence, "op": 1})


async def amain() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    await DiscordAiAgentGatewayWatcher(WatcherConfig.from_env()).run_forever()


if __name__ == "__main__":
    asyncio.run(amain())
