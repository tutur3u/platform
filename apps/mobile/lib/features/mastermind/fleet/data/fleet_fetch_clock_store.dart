import 'package:shared_preferences/shared_preferences.dart';

/// When this device last read the fleet snapshot successfully, per signed-in
/// user. It tells "the publisher stopped" apart from "this phone cannot reach
/// Web", and survives a restart so an offline launch can still say when the
/// fleet was last reached.
abstract interface class FleetFetchClockStore {
  Future<DateTime?> read();

  Future<void> write(DateTime at);
}

final class MemoryFleetFetchClockStore implements FleetFetchClockStore {
  DateTime? _at;

  @override
  Future<DateTime?> read() async => _at;

  @override
  Future<void> write(DateTime at) async => _at = at.toUtc();
}

/// One timestamp per user and nothing else from the fleet.
final class PrefsFleetFetchClockStore implements FleetFetchClockStore {
  PrefsFleetFetchClockStore({required String? Function() userId})
    : _userId = userId;

  final String? Function() _userId;

  String? get _key => switch (_userId()) {
    final id? when id.isNotEmpty => 'mastermind.fleet.lastFetch.$id',
    _ => null,
  };

  @override
  Future<DateTime?> read() async {
    final key = _key;
    if (key == null) return null;
    final raw = (await SharedPreferences.getInstance()).getString(key);
    return raw == null ? null : DateTime.tryParse(raw)?.toUtc();
  }

  @override
  Future<void> write(DateTime at) async {
    final key = _key;
    if (key == null) return;
    await (await SharedPreferences.getInstance()).setString(
      key,
      at.toUtc().toIso8601String(),
    );
  }
}
