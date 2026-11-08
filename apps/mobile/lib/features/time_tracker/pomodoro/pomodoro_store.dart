import 'dart:convert';

import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Keeps the device's Pomodoro across restarts. Device-local only.
class PomodoroStore {
  const PomodoroStore();

  static const _key = 'time-tracker.pomodoro.v1';

  Future<PomodoroState?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw);
      return json is Map<String, dynamic> ? PomodoroState.fromJson(json) : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> write(PomodoroState state) async {
    final prefs = await SharedPreferences.getInstance();
    if (state.isIdle) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, jsonEncode(state.toJson()));
    }
  }
}
