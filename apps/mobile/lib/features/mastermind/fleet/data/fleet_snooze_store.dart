import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Where snoozed decisions are kept: on this device, per signed-in user.
abstract interface class FleetSnoozeStore {
  /// Whose snoozes [read] and [write] reach now; null while signed out.
  String? get scope;

  Future<Map<String, DateTime>> read();

  Future<void> write(Map<String, DateTime> snoozes);
}

final class MemoryFleetSnoozeStore implements FleetSnoozeStore {
  Map<String, DateTime> _snoozes = const {};

  @override
  String? get scope => 'memory';

  @override
  Future<Map<String, DateTime>> read() async => _snoozes;

  @override
  Future<void> write(Map<String, DateTime> snoozes) async =>
      _snoozes = Map.unmodifiable(snoozes);
}

/// Decision ids and wake times only: no titles or other fleet content.
final class PrefsFleetSnoozeStore implements FleetSnoozeStore {
  PrefsFleetSnoozeStore({required String? Function() userId})
    : _userId = userId;

  final String? Function() _userId;

  @override
  String? get scope => switch (_userId()) {
    final id? when id.isNotEmpty => id,
    _ => null,
  };

  String? get _key => switch (scope) {
    final id? => 'mastermind.fleet.snoozes.$id',
    null => null,
  };

  @override
  Future<Map<String, DateTime>> read() async {
    final key = _key;
    if (key == null) return const {};
    // A storage failure propagates so nothing is written over entries that
    // could not be read; only an unreadable stored value reads as empty.
    final raw = (await SharedPreferences.getInstance()).getString(key);
    Object? json;
    try {
      json = raw == null ? null : jsonDecode(raw);
    } on FormatException {
      return const {};
    }
    if (json is! Map<String, dynamic>) return const {};
    return {
      for (final MapEntry(:key, :value) in json.entries)
        if (value is String)
          if (DateTime.tryParse(value)?.toUtc() case final until?) key: until,
    };
  }

  @override
  Future<void> write(Map<String, DateTime> snoozes) async {
    final key = _key;
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (snoozes.isEmpty) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(
      key,
      jsonEncode({
        for (final MapEntry(:key, :value) in snoozes.entries)
          key: value.toUtc().toIso8601String(),
      }),
    );
  }
}
