import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _enabledKey = 'mastermind-catchup-morning-enabled';
const _timeKey = 'mastermind-catchup-morning-time';

/// The "Morning catch-up" preference: off by default, 08:00 once enabled.
@immutable
final class MorningCatchupSettings {
  const MorningCatchupSettings({
    this.enabled = false,
    this.time = const TimeOfDay(hour: 8, minute: 0),
  });

  final bool enabled;
  final TimeOfDay time;

  MorningCatchupSettings copyWith({bool? enabled, TimeOfDay? time}) =>
      MorningCatchupSettings(
        enabled: enabled ?? this.enabled,
        time: time ?? this.time,
      );
}

/// Where a changed preference is also sent.
///
/// There is no push-settings seam in the app and no server-side quiet hours
/// yet, so the preference lives on this device only and
/// [NoopMorningCatchupSync] is the default. TODO(mastermind): when the hub's `PUT /v1/owner/settings`
/// (`morning_summary_at`, `quiet_hours`) exists, implement this against it. The
/// push the server then sends must keep the fixed neutral body in
/// `mastermindCatchupPushBody` ("Your catch-up is ready"), carry no digest
/// content, and be held back during the owner's quiet hours.
abstract interface class MorningCatchupSync {
  Future<void> apply(MorningCatchupSettings settings);
}

final class NoopMorningCatchupSync implements MorningCatchupSync {
  const NoopMorningCatchupSync();

  @override
  Future<void> apply(MorningCatchupSettings settings) async {}
}

/// Local persistence for [MorningCatchupSettings].
final class MorningCatchupSettingsStore {
  const MorningCatchupSettingsStore({
    this.sync = const NoopMorningCatchupSync(),
  });

  final MorningCatchupSync sync;

  Future<MorningCatchupSettings> read() async {
    final prefs = await SharedPreferences.getInstance();
    final time = _parse(prefs.getString(_timeKey));
    return MorningCatchupSettings(
      enabled: prefs.getBool(_enabledKey) ?? false,
      time: time ?? const MorningCatchupSettings().time,
    );
  }

  Future<void> write(MorningCatchupSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, settings.enabled);
    await prefs.setString(_timeKey, formatCatchupTime(settings.time));
    await sync.apply(settings);
  }
}

String formatCatchupTime(TimeOfDay time) =>
    '${time.hour.toString().padLeft(2, '0')}:'
    '${time.minute.toString().padLeft(2, '0')}';

TimeOfDay? _parse(String? raw) {
  final parts = raw?.split(':');
  if (parts == null || parts.length != 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return TimeOfDay(hour: hour, minute: minute);
}
