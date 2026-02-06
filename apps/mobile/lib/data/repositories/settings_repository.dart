import 'package:shared_preferences/shared_preferences.dart';

/// Repository for user preferences (theme, calendar view, etc.).
///
/// Ported from apps/native/lib/stores/ui-store.ts.
class SettingsRepository {
  static const _themeModeKey = 'theme-mode';
  static const _calendarViewKey = 'calendar-view';
  static const _taskViewModeKey = 'task-view-mode';

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
}
