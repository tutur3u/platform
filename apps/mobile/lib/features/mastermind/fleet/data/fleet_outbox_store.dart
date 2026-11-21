import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:path_provider/path_provider.dart';

/// Where fleet answers that have not reached Web survive a restart, for the
/// signed-in user, keyed by decision id.
abstract interface class FleetOutboxStore {
  Future<Map<String, FleetPendingAnswer>> read();

  /// Whether the last [read] found a signed-in account to bind to.
  bool get bound;

  Future<void> write(Map<String, FleetPendingAnswer> entries);

  /// Erases what [read] loaded, for the account it was read for.
  Future<void> clear();
}

final class MemoryFleetOutboxStore implements FleetOutboxStore {
  Map<String, FleetPendingAnswer> _entries = const {};

  @override
  Future<Map<String, FleetPendingAnswer>> read() async => _entries;

  @override
  bool get bound => true;

  @override
  Future<void> write(Map<String, FleetPendingAnswer> entries) async =>
      _entries = Map.unmodifiable(entries);

  @override
  Future<void> clear() async => _entries = const {};
}

/// `<cache>/mastermind/<sha256(userId)>/fleet_outbox.json`, beside the reply
/// outbox, so clearing the Mastermind cache erases it too. A read binds the
/// store to the signed-in account; a write lands only while that account is
/// still signed in, so nothing written for one account reaches another's
/// file. Operations run on one serial queue, writes as temp file then
/// rename, and an unreadable or oversized file reads as empty.
final class FileFleetOutboxStore implements FleetOutboxStore {
  FileFleetOutboxStore({
    required String? Function() userId,
    Future<Directory> Function()? baseDirectory,
  }) : _userId = userId,
       _baseDirectory = baseDirectory ?? getApplicationCacheDirectory;

  static const _maxBytes = 131072;

  final String? Function() _userId;
  final Future<Directory> Function() _baseDirectory;
  String? _owner;
  Future<void> _tail = Future<void>.value();

  Future<T> _serial<T>(Future<T> Function() operation) {
    final future = _tail.then((_) => operation());
    _tail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  Future<File?> _file(String? id) async {
    if (id == null || id.isEmpty) return null;
    final name = sha256.convert(utf8.encode(id)).toString();
    final base = await _baseDirectory();
    return File('${base.path}/mastermind/$name/fleet_outbox.json');
  }

  @override
  bool get bound => _owner != null;

  @override
  Future<Map<String, FleetPendingAnswer>> read() {
    final user = _owner = _userId();
    return _serial(() => _read(user));
  }

  Future<Map<String, FleetPendingAnswer>> _read(String? user) async {
    final file = await _file(user);
    if (file == null || !file.existsSync()) return const {};
    try {
      if (await file.length() > _maxBytes) return const {};
      final json = jsonDecode(await file.readAsString());
      if (json is! Map<String, dynamic>) return const {};
      return {
        for (final MapEntry(:key, :value) in json.entries)
          if (value is Map<String, dynamic>)
            if (FleetPendingAnswer.fromJson(value) case final entry?)
              key: entry,
      };
    } on Object {
      return const {};
    }
  }

  @override
  Future<void> write(Map<String, FleetPendingAnswer> entries) {
    final user = _owner;
    if (user == null || user != _userId()) return Future<void>.value();
    return _serial(() async {
      final file = await _file(user);
      if (file == null) return;
      if (entries.isEmpty) {
        if (file.existsSync()) await file.delete();
        return;
      }
      await file.parent.create(recursive: true);
      final temp = File('${file.path}.tmp');
      await temp.writeAsString(
        jsonEncode({
          for (final MapEntry(:key, :value) in entries.entries)
            key: value.toJson(),
        }),
        flush: true,
      );
      await temp.rename(file.path);
    });
  }

  @override
  Future<void> clear() {
    final user = _owner;
    _owner = null;
    return _serial(() async {
      final file = await _file(user);
      if (file != null && file.existsSync()) await file.delete();
    });
  }
}

/// Persistent on phones; memory elsewhere (tests, desktop debug builds).
FleetOutboxStore createFleetOutboxStore({required String? Function() userId}) =>
    Platform.isAndroid || Platform.isIOS
    ? FileFleetOutboxStore(userId: userId)
    : MemoryFleetOutboxStore();
