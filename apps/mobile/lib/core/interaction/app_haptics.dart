import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Semantic feedback with a per-intent cooldown for continuous gestures.
/// Platform feedback follows the operating system's haptic policy.
class AppHaptics {
  AppHaptics._();

  static bool enabled = true;
  static const _preferenceKey = 'interaction.haptics.enabled';
  static final Map<String, DateTime> _lastPlayed = {};

  static Future<void> initialize() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      enabled = preferences.getBool(_preferenceKey) ?? true;
    } on Object {
      enabled = true;
    }
  }

  static Future<void> setEnabled({required bool value}) async {
    enabled = value;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_preferenceKey, value);
    } on Object {
      // Preserve the in-session choice when preferences are unavailable.
    }
    if (value) await selection();
  }

  static bool get _supported =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.android;

  static Future<void> _play(
    String intent,
    Future<void> Function() action, {
    Duration cooldown = const Duration(milliseconds: 75),
  }) async {
    if (!enabled || !_supported) return;
    final now = DateTime.now();
    final previous = _lastPlayed[intent];
    if (previous != null && now.difference(previous) < cooldown) return;
    _lastPlayed[intent] = now;
    try {
      await action();
    } on MissingPluginException {
      // Web, tests, and older embeds may have no haptic implementation.
    } on PlatformException {
      // Feedback must never interrupt a user action.
    }
  }

  static Future<void> selection() =>
      _play('selection', HapticFeedback.selectionClick);

  static Future<void> pickup() => _play('pickup', HapticFeedback.mediumImpact);

  static Future<void> drop() => _play('drop', HapticFeedback.lightImpact);

  static Future<void> success() =>
      _play('success', HapticFeedback.mediumImpact);

  static Future<void> warning() => _play('warning', HapticFeedback.heavyImpact);
}
