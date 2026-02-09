part of 'calendar_settings_cubit.dart';

/// Valid first-day-of-week preference values, matching the web app and
/// database CHECK constraint.
enum FirstDayOfWeek { auto_, sunday, monday, saturday }

class CalendarSettingsState extends Equatable {
  const CalendarSettingsState({
    this.userPreference = FirstDayOfWeek.auto_,
    this.workspacePreference = FirstDayOfWeek.auto_,
  });

  /// The user's own preference (from `users.first_day_of_week`).
  final FirstDayOfWeek userPreference;

  /// The workspace's default (from `workspaces.first_day_of_week`).
  final FirstDayOfWeek workspacePreference;

  /// Resolves the effective first day of week using priority:
  /// User > Workspace > Auto (Sunday fallback).
  ///
  /// Returns 0 for Sunday, 1 for Monday, 6 for Saturday.
  int resolvedFirstDayIndex([String? localeCode]) {
    final effective = userPreference != FirstDayOfWeek.auto_
        ? userPreference
        : workspacePreference != FirstDayOfWeek.auto_
        ? workspacePreference
        : _detectFromLocale(localeCode);
    return _toIndex(effective);
  }

  CalendarSettingsState copyWith({
    FirstDayOfWeek? userPreference,
    FirstDayOfWeek? workspacePreference,
  }) => CalendarSettingsState(
    userPreference: userPreference ?? this.userPreference,
    workspacePreference: workspacePreference ?? this.workspacePreference,
  );

  @override
  List<Object?> get props => [userPreference, workspacePreference];
}

/// Auto-detect first day of week from locale — mirrors the web's
/// `detectLocaleFirstDay()` in `calendar-settings-resolver.ts`.
FirstDayOfWeek _detectFromLocale(String? localeCode) {
  if (localeCode == null) return FirstDayOfWeek.sunday;
  switch (localeCode) {
    case 'vi':
    case 'de':
    case 'fr':
    case 'es':
    case 'it':
    case 'pt':
    case 'nl':
    case 'ru':
    case 'pl':
    case 'uk':
    case 'cs':
    case 'sv':
    case 'da':
    case 'fi':
    case 'no':
    case 'hu':
    case 'ro':
    case 'bg':
    case 'hr':
    case 'sk':
    case 'sl':
    case 'et':
    case 'lv':
    case 'lt':
    case 'ja':
    case 'ko':
    case 'zh':
      return FirstDayOfWeek.monday;
    case 'ar':
    case 'he':
    case 'fa':
      return FirstDayOfWeek.saturday;
    default:
      return FirstDayOfWeek.sunday;
  }
}

int _toIndex(FirstDayOfWeek day) {
  switch (day) {
    case FirstDayOfWeek.sunday:
    case FirstDayOfWeek.auto_:
      return 0;
    case FirstDayOfWeek.monday:
      return 1;
    case FirstDayOfWeek.saturday:
      return 6;
  }
}

/// Parses a database/API string into [FirstDayOfWeek].
FirstDayOfWeek _parseFirstDayOfWeek(String? value) {
  switch (value) {
    case 'sunday':
      return FirstDayOfWeek.sunday;
    case 'monday':
      return FirstDayOfWeek.monday;
    case 'saturday':
      return FirstDayOfWeek.saturday;
    default:
      return FirstDayOfWeek.auto_;
  }
}

/// Serializes [FirstDayOfWeek] to a database/API string.
String _firstDayOfWeekToString(FirstDayOfWeek day) {
  switch (day) {
    case FirstDayOfWeek.auto_:
      return 'auto';
    case FirstDayOfWeek.sunday:
      return 'sunday';
    case FirstDayOfWeek.monday:
      return 'monday';
    case FirstDayOfWeek.saturday:
      return 'saturday';
  }
}
