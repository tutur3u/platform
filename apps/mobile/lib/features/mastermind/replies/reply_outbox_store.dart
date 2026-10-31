import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// Where queued and sent replies survive a restart, for the signed-in user.
abstract interface class MastermindOutboxStore {
  Future<List<OutboxEntry>> read();
  Future<void> write(List<OutboxEntry> entries);
  Future<void> clear();
}

/// Process-local only; the owner clears it on logout and account switch.
final class MemoryOutboxStore implements MastermindOutboxStore {
  List<OutboxEntry> _entries = const [];

  @override
  Future<List<OutboxEntry>> read() async => _entries;

  @override
  Future<void> write(List<OutboxEntry> entries) async =>
      _entries = List.unmodifiable(entries);

  @override
  Future<void> clear() async => _entries = const [];
}

/// `<base>/mastermind/<sha256(userId)>/outbox.json`: the per-user directory the
/// snapshot cache already uses, so the snapshot store's `clear()` (logout,
/// account switch, lost access) erases queued replies with it.
///
/// The user is resolved on every operation, never captured, so a write queued
/// before an account switch cannot land in the next account's directory (no
/// user means no file). Writes are temp file, flush, rename on one serial
/// queue; anything unreadable, oversized or malformed is discarded.
final class FileOutboxStore implements MastermindOutboxStore {
  FileOutboxStore({
    required Future<Directory> Function() baseDirectory,
    required String? Function() userId,
    DateTime Function()? clock,
  }) : _baseDirectory = baseDirectory,
       _userId = userId,
       _clock = clock ?? DateTime.now;

  static const _schema = 1;
  static const _maxBytes = 262144;

  final Future<Directory> Function() _baseDirectory;
  final String? Function() _userId;
  final DateTime Function() _clock;
  Future<void> _tail = Future<void>.value();

  Future<T> _serial<T>(Future<T> Function() operation) {
    final future = _tail.then((_) => operation());
    _tail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  Future<File?> _file() async {
    final id = _userId();
    if (id == null || id.isEmpty) return null;
    final name = sha256.convert(utf8.encode(id)).toString();
    final base = await _baseDirectory();
    return File('${base.path}/mastermind/$name/outbox.json');
  }

  @override
  Future<List<OutboxEntry>> read() => _serial(_read);

  Future<List<OutboxEntry>> _read() async {
    final file = await _file();
    if (file == null || !file.existsSync()) return const [];
    try {
      if (await file.length() > _maxBytes) {
        await file.delete();
        return const [];
      }
      final decoded = jsonDecode(await file.readAsString());
      final raw =
          decoded is Map<String, dynamic> && decoded['schema'] == _schema
          ? decoded['entries']
          : null;
      if (raw is! List) throw const FormatException('outbox');
      return normalizeOutbox([
        for (final item in raw)
          if (OutboxEntry.fromStoredJson(item) case final entry?) entry,
      ], now: _clock().toUtc());
    } on Object {
      try {
        await file.delete();
      } on Object {
        /* An unreadable outbox is never trusted, even if it stays on disk. */
      }
      return const [];
    }
  }

  @override
  Future<void> write(List<OutboxEntry> entries) =>
      _serial(() => _write(entries));

  Future<void> _write(List<OutboxEntry> entries) async {
    final file = await _file();
    if (file == null) return;
    if (entries.isEmpty) {
      if (file.existsSync()) await file.delete();
      return;
    }
    await file.parent.create(recursive: true);
    final temp = File('${file.path}.tmp');
    await temp.writeAsString(
      jsonEncode({
        'schema': _schema,
        'entries': [for (final entry in entries) entry.toStoredJson()],
      }),
      flush: true,
    );
    await temp.rename(file.path);
  }

  /// Erases every user's outbox, not just the current one: after a logout there
  /// is no current user, and after a switch the previous one is the target.
  @override
  Future<void> clear() => _serial(_clear);

  Future<void> _clear() async {
    final root = Directory('${(await _baseDirectory()).path}/mastermind');
    if (!root.existsSync()) return;
    await for (final entity in root.list(followLinks: false)) {
      if (entity is! Directory) continue;
      for (final name in const ['outbox.json', 'outbox.json.tmp']) {
        final file = File('${entity.path}/$name');
        if (file.existsSync()) await file.delete();
      }
    }
  }
}
