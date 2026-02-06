import 'package:shared_preferences/shared_preferences.dart';

/// Repository for user preferences (theme, calendar view, etc.).
///
/// Ported from apps/native/lib/stores/ui-store.ts.
class SettingsRepository {
  static const _themeModeKey = 'theme-mode';
  static const _calendarViewKey = 'calendar-view';
  static const _taskViewModeKey = 'task-view-mode';
  static const _localeKey = 'locale';

  Future<String> getThemeMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_themeModeKey) ?? 'system';
  }

  Future<void> setThemeMode(String mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeModeKey, mode);
  }

  Future<String> getCalendarView() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_calendarViewKey) ?? 'week';
  }

  Future<void> setCalendarView(String view) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_calendarViewKey, view);
  }

  Future<String> getTaskViewMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_taskViewModeKey) ?? 'list';
  }

  Future<void> setTaskViewMode(String mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_taskViewModeKey, mode);
  }

  /// Returns the persisted locale code (e.g. 'en', 'vi'), or `null` for system
  /// default.
  Future<String?> getLocale() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_localeKey);
  }

  /// Persists the user's locale choice. Pass `null` to revert to system
  /// default.
  Future<void> setLocale(String? locale) async {
    final prefs = await SharedPreferences.getInstance();
    if (locale == null) {
      await prefs.remove(_localeKey);
    } else {
      await prefs.setString(_localeKey, locale);
    }
  }
}
