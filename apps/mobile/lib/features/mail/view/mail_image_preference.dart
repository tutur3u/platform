import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App-wide preference for loading external images in received messages.
class MailImagePreference extends ValueNotifier<bool> {
  MailImagePreference() : super(true);

  static final instance = MailImagePreference();
  static const storageKey = 'mail.showRemoteImages';
  Future<void>? _loading;
  bool _selected = false;

  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getBool(storageKey);
      if (!_selected && saved != null) value = saved;
    } on Exception {
      // Keep the enabled default when preferences are unavailable.
    }
  }

  Future<void> select({required bool enabled}) async {
    _selected = true;
    value = enabled;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(storageKey, enabled);
    } on Exception {
      // Keep the current session choice when disk storage is unavailable.
    }
  }
}
