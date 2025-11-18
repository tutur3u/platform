"""Comprehensive tests for daily report functionality."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from daily_report import (
    DailyReportConfigurationError,
    ReportConfig,
    ReportFormat,
    ReportMode,
    UserStats,
    _get_weekend_dates,
    _is_monday,
    _is_weekend,
    _merge_weekend_stats,
    trigger_daily_report,
)

# Test timezone
TEST_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class TestHelperFunctions:
    """Test helper utility functions."""

    def test_is_weekend_saturday(self):
        """Test weekend detection for Saturday."""
        saturday = datetime(2025, 1, 11, 10, 0, tzinfo=TEST_TZ)  # Saturday
        assert _is_weekend(saturday, TEST_TZ) is True

    def test_is_weekend_sunday(self):
        """Test weekend detection for Sunday."""
        sunday = datetime(2025, 1, 12, 10, 0, tzinfo=TEST_TZ)  # Sunday
        assert _is_weekend(sunday, TEST_TZ) is True

    def test_is_weekend_monday(self):
        """Test weekend detection for Monday (should be False)."""
        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)  # Monday
        assert _is_weekend(monday, TEST_TZ) is False

    def test_is_weekend_friday(self):
        """Test weekend detection for Friday (should be False)."""
        friday = datetime(2025, 1, 10, 10, 0, tzinfo=TEST_TZ)  # Friday
        assert _is_weekend(friday, TEST_TZ) is False

    def test_is_monday_true(self):
        """Test Monday detection for Monday."""
        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)  # Monday
        assert _is_monday(monday, TEST_TZ) is True

    def test_is_monday_false(self):
        """Test Monday detection for Tuesday."""
        tuesday = datetime(2025, 1, 14, 10, 0, tzinfo=TEST_TZ)  # Tuesday
        assert _is_monday(tuesday, TEST_TZ) is False

    def test_get_weekend_dates(self):
        """Test getting weekend dates from Monday."""
        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)  # Monday
        saturday, sunday = _get_weekend_dates(monday, TEST_TZ)

        assert saturday.day == 11  # Saturday
        assert sunday.day == 12  # Sunday
        assert saturday.weekday() == 5
        assert sunday.weekday() == 6

    def test_merge_weekend_stats_both_days(self):
        """Test merging weekend stats when user worked both days."""
        saturday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 3600, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            }
        ]
        sunday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 7200, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            }
        ]

        result = _merge_weekend_stats(saturday_stats, sunday_stats)

        assert "user-1" in result
        assert result["user-1"]["saturdayTime"] == 3600
        assert result["user-1"]["sundayTime"] == 7200
        assert result["user-1"]["weekendTotal"] == 10800

    def test_merge_weekend_stats_saturday_only(self):
        """Test merging weekend stats when user worked Saturday only."""
        saturday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 3600, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            }
        ]
        sunday_stats: list[UserStats] = []

        result = _merge_weekend_stats(saturday_stats, sunday_stats)

        assert "user-1" in result
        assert result["user-1"]["saturdayTime"] == 3600
        assert result["user-1"]["sundayTime"] == 0
        assert result["user-1"]["weekendTotal"] == 3600

    def test_merge_weekend_stats_sunday_only(self):
        """Test merging weekend stats when user worked Sunday only."""
        saturday_stats: list[UserStats] = []
        sunday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 7200, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            }
        ]

        result = _merge_weekend_stats(saturday_stats, sunday_stats)

        assert "user-1" in result
        assert result["user-1"]["saturdayTime"] == 0
        assert result["user-1"]["sundayTime"] == 7200
        assert result["user-1"]["weekendTotal"] == 7200

    def test_merge_weekend_stats_multiple_users(self):
        """Test merging weekend stats for multiple users."""
        saturday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 3600, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            },
            {
                "user": {"platform_user_id": "user-2", "display_name": "Bob"},
                "stats": {"todayTime": 1800, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            },
        ]
        sunday_stats: list[UserStats] = [
            {
                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                "stats": {"todayTime": 7200, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            },
            {
                "user": {"platform_user_id": "user-3", "display_name": "Charlie"},
                "stats": {"todayTime": 5400, "yesterdayTime": 0, "weekTime": 0, "monthTime": 0},
            },
        ]

        result = _merge_weekend_stats(saturday_stats, sunday_stats)

        assert len(result) == 3
        assert result["user-1"]["weekendTotal"] == 10800
        assert result["user-2"]["weekendTotal"] == 1800
        assert result["user-3"]["weekendTotal"] == 5400


class TestReportConfig:
    """Test ReportConfig dataclass and environment parsing."""

    def test_from_environment_minimal(self, monkeypatch):
        """Test config from minimal required env vars."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")

        config = ReportConfig.from_environment()

        assert config.channel_id == "12345"
        assert config.workspace_id == "workspace-1"
        assert config.skip_weekends is True  # Default
        assert config.report_format == ReportFormat.SUMMARY  # Default

    def test_from_environment_full(self, monkeypatch):
        """Test config from all env vars."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_SKIP_WEEKENDS", "false")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_FORMAT", "detailed")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_TIMEZONE", "America/New_York")

        config = ReportConfig.from_environment()

        assert config.channel_id == "12345"
        assert config.workspace_id == "workspace-1"
        assert config.skip_weekends is False
        assert config.report_format == ReportFormat.DETAILED
        assert config.timezone == ZoneInfo("America/New_York")

    def test_from_environment_fallback_channel(self, monkeypatch):
        """Test fallback to DISCORD_ANNOUNCEMENT_CHANNEL."""
        monkeypatch.setenv("DISCORD_ANNOUNCEMENT_CHANNEL", "67890")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.delenv("DISCORD_DAILY_REPORT_CHANNEL", raising=False)

        config = ReportConfig.from_environment()

        assert config.channel_id == "67890"

    def test_from_environment_missing_channel(self, monkeypatch):
        """Test error when channel ID is missing."""
        monkeypatch.delenv("DISCORD_DAILY_REPORT_CHANNEL", raising=False)
        monkeypatch.delenv("DISCORD_ANNOUNCEMENT_CHANNEL", raising=False)
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")

        with pytest.raises(DailyReportConfigurationError, match="CHANNEL"):
            ReportConfig.from_environment()

    def test_from_environment_missing_workspace(self, monkeypatch):
        """Test error when workspace ID is missing."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.delenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", raising=False)

        with pytest.raises(DailyReportConfigurationError, match="WORKSPACE"):
            ReportConfig.from_environment()

    def test_from_environment_invalid_format(self, monkeypatch):
        """Test fallback for invalid report format."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_FORMAT", "invalid")

        config = ReportConfig.from_environment()

        assert config.report_format == ReportFormat.SUMMARY  # Fallback

    def test_from_environment_invalid_timezone(self, monkeypatch):
        """Test fallback for invalid timezone."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_TIMEZONE", "Invalid/Timezone")

        config = ReportConfig.from_environment()

        assert config.timezone == ZoneInfo("Asia/Ho_Chi_Minh")  # Fallback


class TestStandardReport:
    """Test standard daily report generation (Tue-Fri)."""

    @pytest.mark.asyncio
    async def test_trigger_daily_report_posts_report(self, monkeypatch):
        """Test standard report generation with data."""
        sent = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, _target_date):
                return (
                    [
                        {
                            "user": {
                                "platform_user_id": "user-1",
                                "display_name": "Ada",
                            },
                            "stats": {
                                "todayTime": 3600,
                                "yesterdayTime": 1800,
                                "weekTime": 7200,
                                "monthTime": 14400,
                            },
                        }
                    ],
                    [
                        {
                            "platform_user_id": "user-1",
                            "display_name": "Ada",
                        }
                    ],
                )

            def _render_workspace_report(
                self, _aggregated, _members_meta, _workspace_id, _target_date
            ):
                return "# Report\nAda logged 1h today."

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        # Use a Tuesday for standard report
        tuesday = datetime(2025, 1, 14, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=tuesday)

        assert result["mode"] == ReportMode.STANDARD.value
        assert result["channel_id"] == "12345"
        assert sent == [("12345", "# Report\nAda logged 1h today."[:1800], {"parse": []})]

    @pytest.mark.asyncio
    async def test_trigger_daily_report_handles_no_data(self, monkeypatch):
        """Test standard report with no data."""
        sent = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, _target_date):
                return ([], [])

            def _render_workspace_report(self, *_args, **_kwargs):
                raise AssertionError("Should not render when no data")

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        tuesday = datetime(2025, 1, 14, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=tuesday)

        assert result["mode"] == ReportMode.NO_DATA.value
        assert "No tracked time" in result["content"]
        assert sent == [("12345", result["content"], {"parse": []})]

    @pytest.mark.asyncio
    async def test_trigger_daily_report_requires_workspace(self, monkeypatch):
        """Test configuration validation."""
        monkeypatch.delenv("DISCORD_DAILY_REPORT_CHANNEL", raising=False)
        monkeypatch.delenv("DISCORD_ANNOUNCEMENT_CHANNEL", raising=False)
        monkeypatch.delenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", raising=False)

        with pytest.raises(DailyReportConfigurationError):
            await trigger_daily_report()


class TestWeekendSkipping:
    """Test weekend detection and skipping."""

    @pytest.mark.asyncio
    async def test_skip_saturday_when_enabled(self, monkeypatch):
        """Test that Saturday reports are skipped when enabled."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_SKIP_WEEKENDS", "true")

        saturday = datetime(2025, 1, 11, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=saturday)

        assert result["mode"] == ReportMode.SKIPPED_WEEKEND.value
        assert "Weekend detected" in result["content"]
        assert result.get("skipped") == "true"

    @pytest.mark.asyncio
    async def test_skip_sunday_when_enabled(self, monkeypatch):
        """Test that Sunday reports are skipped when enabled."""
        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_SKIP_WEEKENDS", "true")

        sunday = datetime(2025, 1, 12, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=sunday)

        assert result["mode"] == ReportMode.SKIPPED_WEEKEND.value

    @pytest.mark.asyncio
    async def test_weekend_not_skipped_when_disabled(self, monkeypatch):
        """Test that weekend reports run when skip is disabled."""
        sent = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, _target_date):
                return (
                    [
                        {
                            "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                            "stats": {
                                "todayTime": 3600,
                                "yesterdayTime": 0,
                                "weekTime": 3600,
                                "monthTime": 3600,
                            },
                        }
                    ],
                    [{"platform_user_id": "user-1", "display_name": "Ada"}],
                )

            def _render_workspace_report(self, *_args, **_kwargs):
                return "# Weekend Report\nAda worked on Saturday."

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_SKIP_WEEKENDS", "false")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        saturday = datetime(2025, 1, 11, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=saturday)

        assert result["mode"] == ReportMode.STANDARD.value
        assert len(sent) == 1


class TestMondaySummary:
    """Test Monday 3-day summary report."""

    @pytest.mark.asyncio
    async def test_monday_summary_with_weekend_data(self, monkeypatch):
        """Test Monday report includes weekend summary."""
        sent = []
        fetch_calls = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, target_date):
                fetch_calls.append(target_date.strftime("%A"))
                # Return different data based on day
                if target_date.weekday() == 5:  # Saturday
                    return (
                        [
                            {
                                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                                "stats": {
                                    "todayTime": 3600,
                                    "yesterdayTime": 0,
                                    "weekTime": 0,
                                    "monthTime": 0,
                                },
                            }
                        ],
                        [{"platform_user_id": "user-1", "display_name": "Ada"}],
                    )
                if target_date.weekday() == 6:  # Sunday
                    return (
                        [
                            {
                                "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                                "stats": {
                                    "todayTime": 7200,
                                    "yesterdayTime": 0,
                                    "weekTime": 0,
                                    "monthTime": 0,
                                },
                            }
                        ],
                        [{"platform_user_id": "user-1", "display_name": "Ada"}],
                    )
                # Monday
                return (
                    [
                        {
                            "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                            "stats": {
                                "todayTime": 5400,
                                "yesterdayTime": 0,
                                "weekTime": 16200,
                                "monthTime": 16200,
                            },
                        }
                    ],
                    [{"platform_user_id": "user-1", "display_name": "Ada"}],
                )

            def _get_discord_user_map(self, _workspace_id):
                return {}

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=monday)

        assert result["mode"] == ReportMode.WEEKEND_SUMMARY.value
        assert len(fetch_calls) == 3  # Sat, Sun, Mon
        assert "Saturday" in fetch_calls
        assert "Sunday" in fetch_calls
        assert "Monday" in fetch_calls
        assert len(sent) == 1
        content = sent[0][1]
        assert "Weekend + Monday Report" in content
        assert "Weekend Summary (Sat-Sun)" in content

    @pytest.mark.asyncio
    async def test_monday_summary_no_weekend_data(self, monkeypatch):
        """Test Monday report when no weekend data exists."""
        sent = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, _target_date):
                # No data for any day
                return ([], [{"platform_user_id": "user-1", "display_name": "Ada"}])

            def _get_discord_user_map(self, _workspace_id):
                return {}

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=monday)

        assert result["mode"] == ReportMode.NO_DATA.value
        assert "No tracked time recorded this weekend or today" in result["content"]

    @pytest.mark.asyncio
    async def test_monday_summary_fallback_on_error(self, monkeypatch):
        """Test Monday falls back to standard report if weekend fetch fails."""
        sent = []

        class FakeCommandHandler:
            def _fetch_workspace_time_tracking_stats(self, _workspace_id, target_date):
                # Fail for Saturday/Sunday, succeed for Monday
                if target_date.weekday() in (5, 6):
                    return (None, [])  # Trigger error
                return (
                    [
                        {
                            "user": {"platform_user_id": "user-1", "display_name": "Ada"},
                            "stats": {
                                "todayTime": 5400,
                                "yesterdayTime": 0,
                                "weekTime": 5400,
                                "monthTime": 5400,
                            },
                        }
                    ],
                    [{"platform_user_id": "user-1", "display_name": "Ada"}],
                )

            def _render_workspace_report(self, *_args, **_kwargs):
                return "# Standard Monday Report"

        async def fake_send(channel_id, content, allowed_mentions):
            sent.append((channel_id, content, allowed_mentions))

        monkeypatch.setenv("DISCORD_DAILY_REPORT_CHANNEL", "12345")
        monkeypatch.setenv("DISCORD_DAILY_REPORT_WORKSPACE_ID", "workspace-1")
        monkeypatch.setattr("daily_report.CommandHandler", FakeCommandHandler)
        monkeypatch.setattr("daily_report.DiscordClient.send_channel_message", fake_send)

        monday = datetime(2025, 1, 13, 10, 0, tzinfo=TEST_TZ)
        result = await trigger_daily_report(now=monday)

        # Should fall back to standard report
        assert result["mode"] == ReportMode.STANDARD.value
        assert "Standard Monday Report" in sent[0][1]
