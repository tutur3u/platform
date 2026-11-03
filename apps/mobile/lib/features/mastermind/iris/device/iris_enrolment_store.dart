import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

enum IrisEnrolmentState { pending, enrolled }

/// What this device knows about its own enrolment. Not a secret and not an
/// authority: the relay decides. It only keeps the app from signing (and
/// prompting for biometrics) when no enrolment could accept the signature.
final class IrisEnrolmentRecord {
  const IrisEnrolmentRecord({
    required this.state,
    required this.deviceId,
    required this.fingerprint,
    this.expiresAt,
  });

  final IrisEnrolmentState state;
  final String deviceId;
  final String fingerprint;

  /// When a pending enrolment lapses; null once enrolled.
  final DateTime? expiresAt;

  /// Enrolled, or pending and not yet expired at [now].
  bool activeAt(DateTime now) =>
      state == IrisEnrolmentState.enrolled ||
      (expiresAt != null && now.isBefore(expiresAt!));

  Map<String, Object?> toJson() => {
    'state': state.name,
    'device_id': deviceId,
    'fingerprint': fingerprint,
    'expires_at': ?expiresAt?.toUtc().toIso8601String(),
  };

  static IrisEnrolmentRecord? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final state = IrisEnrolmentState.values.asNameMap()[json['state']];
    final deviceId = json['device_id'];
    final fingerprint = json['fingerprint'];
    final expires = json['expires_at'];
    if (state == null || deviceId is! String || fingerprint is! String) {
      return null;
    }
    final expiresAt = expires is String ? DateTime.tryParse(expires) : null;
    if (state == IrisEnrolmentState.pending && expiresAt == null) return null;
    return IrisEnrolmentRecord(
      state: state,
      deviceId: deviceId,
      fingerprint: fingerprint,
      expiresAt: expiresAt,
    );
  }
}

abstract interface class IrisEnrolmentStore {
  Future<IrisEnrolmentRecord?> read();
  Future<void> write(IrisEnrolmentRecord record);
  Future<void> clear();
}

/// Kept in shared preferences: ids and a public fingerprint only.
final class PreferencesIrisEnrolmentStore implements IrisEnrolmentStore {
  const PreferencesIrisEnrolmentStore();

  static const _key = 'mastermind.iris.device_enrolment.v1';

  @override
  Future<IrisEnrolmentRecord?> read() async {
    final raw = (await SharedPreferences.getInstance()).getString(_key);
    if (raw == null) return null;
    try {
      return IrisEnrolmentRecord.fromJson(jsonDecode(raw));
    } on FormatException {
      return null;
    }
  }

  @override
  Future<void> write(IrisEnrolmentRecord record) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(record.toJson()));
  }

  @override
  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
