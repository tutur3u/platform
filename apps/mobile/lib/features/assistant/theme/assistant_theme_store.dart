import 'dart:async';

import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Reads and writes only theme JSON. No conversation data enters this store.
class AssistantThemeStore {
  AssistantThemeStore({Future<SharedPreferences> Function()? preferences})
    : _preferences = preferences ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _preferences;
  static final _pending = <String, Future<void>>{};

  static String keyFor(String actorId) => '$actorId::assistant-chat-theme::v1';

  Future<T> _serialized<T>(String key, Future<T> Function() action) async {
    final previous = _pending[key];
    final done = Completer<void>();
    _pending[key] = done.future;
    try {
      if (previous != null) await previous;
      return await action();
    } finally {
      done.complete();
      if (identical(_pending[key], done.future)) {
        unawaited(_pending.remove(key));
      }
    }
  }

  Future<AssistantThemePreferences> read(
    String actorId, {
    required bool Function() isCurrent,
  }) => _serialized(keyFor(actorId), () async {
    if (!isCurrent()) return const AssistantThemePreferences();
    final prefs = await _preferences();
    if (!isCurrent()) return const AssistantThemePreferences();
    final raw = prefs.get(keyFor(actorId));
    return AssistantThemePreferences.decode(raw is String ? raw : null);
  });

  Future<bool> write(
    String actorId,
    AssistantThemePreferences value, {
    required bool Function() isCurrent,
  }) => _serialized(keyFor(actorId), () async {
    if (!isCurrent()) return false;
    final prefs = await _preferences();
    if (!isCurrent()) return false;
    final saved = await prefs.setString(keyFor(actorId), value.encode());
    return saved && isCurrent();
  });
}
