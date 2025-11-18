from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from discord_client import DiscordMissingPermissionsError
from wol_reminder import (
    WOL_CUTOFF_DISPLAY,
    build_wol_reminder_message,
    trigger_wol_reminder,
)


def test_build_wol_reminder_message_includes_tomorrow_date_and_cutoff():
    tz = ZoneInfo("Asia/Ho_Chi_Minh")
    now = datetime(2025, 6, 1, 21, 0, tzinfo=tz)

    message = build_wol_reminder_message(now)

    assert "@everyone" in message
    assert WOL_CUTOFF_DISPLAY in message
    assert "Monday, 02 June 2025" in message


@pytest.mark.asyncio
async def test_trigger_wol_reminder_falls_back_without_everyone(monkeypatch):
    calls = []

    async def fake_send(_channel_id, _content, allowed_mentions):
        calls.append(allowed_mentions)
        if len(calls) == 1:
            raise DiscordMissingPermissionsError(
                "missing permission",
                status=403,
                code=50013,
            )

    monkeypatch.setenv("DISCORD_ANNOUNCEMENT_CHANNEL", "123456789")
    monkeypatch.setattr("wol_reminder.DiscordClient.send_channel_message", fake_send)

    tz = ZoneInfo("Asia/Ho_Chi_Minh")
    now = datetime(2025, 6, 1, 21, 0, tzinfo=tz)

    result = await trigger_wol_reminder(now)

    assert len(calls) == 2
    assert calls[0] == {"parse": ["everyone"]}
    assert calls[1] == {"parse": []}
    assert result["mode"] == "no-mention"
