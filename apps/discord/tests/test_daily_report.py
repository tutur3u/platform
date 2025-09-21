import pytest

from daily_report import DailyReportConfigurationError, trigger_daily_report


@pytest.mark.asyncio
async def test_trigger_daily_report_posts_report(monkeypatch):
    sent = []

    class FakeCommandHandler:
        def _fetch_workspace_time_tracking_stats(self, workspace_id, target_date):  # noqa: SLF001
            return (
                [
                    {
                        'user': {
                            'platform_user_id': 'user-1',
                            'display_name': 'Ada',
                        },
                        'stats': {
                            'todayTime': 3600,
                            'yesterdayTime': 1800,
                            'weekTime': 7200,
                            'monthTime': 14400,
                        },
                    }
                ],
                [
                    {
                        'platform_user_id': 'user-1',
                        'display_name': 'Ada',
                    }
                ],
            )

        def _render_workspace_report(  # noqa: SLF001
            self, aggregated, members_meta, workspace_id, target_date
        ):
            return '# Report\nAda logged 1h today.'

    async def fake_send(channel_id, content, allowed_mentions):
        sent.append((channel_id, content, allowed_mentions))

    monkeypatch.setenv('DISCORD_DAILY_REPORT_CHANNEL', '12345')
    monkeypatch.setenv('DISCORD_DAILY_REPORT_WORKSPACE_ID', 'workspace-1')
    monkeypatch.setattr('daily_report.CommandHandler', FakeCommandHandler)
    monkeypatch.setattr('daily_report.DiscordClient.send_channel_message', fake_send)

    result = await trigger_daily_report()

    assert result['mode'] == 'report'
    assert result['channel_id'] == '12345'
    assert sent == [('12345', '# Report\nAda logged 1h today.'[:1800], {'parse': []})]


@pytest.mark.asyncio
async def test_trigger_daily_report_handles_no_data(monkeypatch):
    sent = []

    class FakeCommandHandler:
        def _fetch_workspace_time_tracking_stats(self, workspace_id, target_date):  # noqa: SLF001
            return ([], [])

        def _render_workspace_report(self, *args, **kwargs):  # noqa: SLF001
            raise AssertionError('Should not render when no data')

    async def fake_send(channel_id, content, allowed_mentions):
        sent.append((channel_id, content, allowed_mentions))

    monkeypatch.setenv('DISCORD_DAILY_REPORT_CHANNEL', '12345')
    monkeypatch.setenv('DISCORD_DAILY_REPORT_WORKSPACE_ID', 'workspace-1')
    monkeypatch.setattr('daily_report.CommandHandler', FakeCommandHandler)
    monkeypatch.setattr('daily_report.DiscordClient.send_channel_message', fake_send)

    result = await trigger_daily_report()

    assert result['mode'] == 'no-data'
    assert 'No tracked time' in result['content']
    assert sent == [('12345', result['content'], {'parse': []})]


@pytest.mark.asyncio
async def test_trigger_daily_report_requires_workspace(monkeypatch):
    monkeypatch.delenv('DISCORD_DAILY_REPORT_CHANNEL', raising=False)
    monkeypatch.delenv('DISCORD_ANNOUNCEMENT_CHANNEL', raising=False)
    monkeypatch.delenv('DISCORD_DAILY_REPORT_WORKSPACE_ID', raising=False)

    with pytest.raises(DailyReportConfigurationError):
        await trigger_daily_report()
