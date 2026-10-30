import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-wide analytics and crash report consent.
///
/// Collection is off until the user explicitly allows it, in every region:
/// there is no locale or region default. The answer is stored on the device
/// with the notice version it was given under and the time. A different notice
/// version voids the stored answer, so collection stays off until it is asked
/// again.
class TelemetryPreference extends ChangeNotifier {
  TelemetryPreference({
    this.noticeVersion = currentNoticeVersion,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  static final instance = TelemetryPreference();

  /// Bump with any wording change to the prompt or the Settings description.
  static const currentNoticeVersion = 'telemetry-consent-v1';
  static const choiceKey = 'telemetry-consent-choice';
  static const noticeVersionKey = 'telemetry-consent-notice-version';
  static const decidedAtKey = 'telemetry-consent-decided-at';

  /// Written by builds that defaulted by region; never trusted as consent.
  static const legacyKey = 'share-analytics-and-crash-reports';

  final String noticeVersion;
  final DateTime Function() _clock;
  bool enabled = false;
  bool ready = false;
  bool busy = false;
  bool hasExplicitChoice = false;
  bool _promptEligible = false;
  late Future<void> Function({required bool enabled}) _apply;

  /// The prompt is due for eligible builds while no answer is stored for
  /// the current notice version.
  bool get consentPending => ready && _promptEligible && !hasExplicitChoice;

  Future<void> initialize({
    required Future<void> Function({required bool enabled}) apply,
    Future<bool?> Function()? read,
    bool promptEligible = false,
  }) async {
    final saved = await (read?.call() ?? _read());
    hasExplicitChoice = saved != null;
    _promptEligible = promptEligible;
    enabled = saved ?? false;
    _apply = apply;
    await apply(enabled: enabled);
    ready = true;
    notifyListeners();
  }

  /// Session transitions (sign-out, account switch) never carry collection over
  /// on trust: it is revoked first, then enabled again only if the stored
  /// choice, read afresh, is an explicit Allow for the current notice version.
  /// Never throws, so a storage failure cannot block signing out.
  Future<void> reloadConsent() async {
    if (!ready || busy) return;
    enabled = false;
    bool? saved;
    try {
      await _apply(enabled: false);
      saved = await _read();
      hasExplicitChoice = saved != null;
      if (saved ?? false) {
        await _apply(enabled: true);
        enabled = true;
      }
    } on Object catch (error) {
      enabled = false;
      log('Telemetry consent reload failed: ${error.runtimeType}');
    }
    notifyListeners();
  }

  Future<bool?> _read() async {
    final prefs = await SharedPreferences.getInstance();
    // Older builds could leave a regional default or an "on" here.
    if (prefs.containsKey(legacyKey)) await prefs.remove(legacyKey);
    if (prefs.getString(noticeVersionKey) != noticeVersion) return null;
    return prefs.getBool(choiceKey);
  }

  Future<void> setEnabled({required bool value}) async {
    if (!ready || busy) return;
    busy = true;
    notifyListeners();
    try {
      // Revoke collection before waiting for disk. Allowing requires a durable
      // choice first, so a failed write cannot turn collection on.
      if (!value) {
        enabled = false;
        await _apply(enabled: false);
      }
      final prefs = await SharedPreferences.getInstance();
      // The version goes last: a partial write leaves the answer void, which
      // keeps collection off and asks again.
      final saved =
          await prefs.setBool(choiceKey, value) &&
          await prefs.setString(
            decidedAtKey,
            _clock().toUtc().toIso8601String(),
          ) &&
          await prefs.setString(noticeVersionKey, noticeVersion);
      if (!saved) {
        throw StateError('Telemetry preference could not be saved');
      }
      if (value) await _apply(enabled: true);
      enabled = value;
      hasExplicitChoice = true;
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
