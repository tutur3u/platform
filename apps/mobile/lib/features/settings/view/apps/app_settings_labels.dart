import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Effective first day: the personal choice, then the workspace default.
String calendarFirstDayLabel(
  CalendarSettingsState state,
  AppLocalizations l10n,
) {
  final effective = state.userPreference != FirstDayOfWeek.auto_
      ? state.userPreference
      : state.workspacePreference;
  return switch (effective) {
    FirstDayOfWeek.auto_ => l10n.settingsFirstDayAuto,
    FirstDayOfWeek.sunday => l10n.settingsFirstDaySunday,
    FirstDayOfWeek.monday => l10n.settingsFirstDayMonday,
    FirstDayOfWeek.saturday => l10n.settingsFirstDaySaturday,
  };
}

String taskBoardNavigationLabel(
  AppLocalizations l10n, {
  required bool? boardPicker,
}) => switch (boardPicker) {
  null => l10n.commonLoading,
  true => l10n.settingsDefaultTaskBoardNavigationBoardPicker,
  false => l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
};

String pomodoroSummary(PomodoroSettings settings, AppLocalizations l10n) => l10n
    .settingsPomodoroSummary(settings.focusMinutes, settings.shortBreakMinutes);

String financeAmountsLabel(
  AppLocalizations l10n, {
  required bool showAmounts,
}) => showAmounts ? l10n.financeShowAmounts : l10n.financeHideAmounts;
