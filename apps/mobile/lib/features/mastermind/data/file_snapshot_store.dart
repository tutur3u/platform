import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';

/// Where the Mastermind event cursor sits for the cached export.
final class StoredEventCursor {
  const StoredEventCursor({required this.lastSeenSeq, this.rebaselinedAt});
  final int lastSeenSeq;
  final DateTime? rebaselinedAt;
}

/// Last good snapshot bytes plus digest, one directory per signed-in user:
/// `<base>/mastermind/<sha256(userId)>/{snapshot.json,meta.json}`.
///
/// The payload is the publisher-sanitized phone export in app-private storage,
/// so it is not encrypted here (security review Q-S1). Files rely on the
/// sandbox; there is no portable chmod. Writes are temp file, flush, rename.
/// Anything unreadable, torn or tampered is discarded, never partially used.
final class FileSnapshotStore implements MastermindSnapshotStore {
  FileSnapshotStore({
    required Future<Directory> Function() baseDirectory,
    required String? Function() userId,
  }) : _baseDirectory = baseDirectory,
       _userId = userId;

  static const _metaSchema = 1;
  static const _maxBytes = 600000;
  static final _hex64 = RegExp(r'^[a-f0-9]{64}$');

  final Future<Directory> Function() _baseDirectory;
  final String? Function() _userId;

  Future<Directory> _root() async =>
      Directory('${(await _baseDirectory()).path}/mastermind');

  Future<Directory?> _userDirectory() async {
    final id = _userId();
    if (id == null || id.isEmpty) return null;
    final name = sha256.convert(utf8.encode(id)).toString();
    return Directory('${(await _root()).path}/$name');
  }

  @override
  Future<StoredSnapshot?> read() async {
    final dir = await _userDirectory();
    if (dir == null || !dir.existsSync()) return null;
    try {
      final snapshotFile = File('${dir.path}/snapshot.json');
      final metaFile = File('${dir.path}/meta.json');
      final meta = _readMeta(await metaFile.readAsString());
      final bytes = await snapshotFile.readAsBytes();
      if (meta == null ||
          bytes.length > _maxBytes ||
          bytes.length != meta.length ||
          sha256.convert(bytes).toString() != meta.sha256) {
        await _discard(dir);
        return null;
      }
      return StoredSnapshot(bytes, meta.receivedAt, digest: meta.digest);
    } on Object {
      await _discard(dir);
      return null;
    }
  }

  @override
  Future<void> write(
    Uint8List bytes,
    DateTime receivedAt, {
    required String digest,
  }) async {
    final dir = await _userDirectory();
    if (dir == null || !_hex64.hasMatch(digest) || bytes.length > _maxBytes) {
      return;
    }
    final previous = await _previousMeta(dir);
    await _pruneOtherUsers(dir);
    await dir.create(recursive: true);
    await _atomicWrite('${dir.path}/snapshot.json', bytes);
    await _atomicWrite(
      '${dir.path}/meta.json',
      utf8.encode(
        jsonEncode({
          'schema': _metaSchema,
          'digest': digest,
          'received_at': receivedAt.toUtc().toIso8601String(),
          'bytes': bytes.length,
          'snapshot_sha256': sha256.convert(bytes).toString(),
          if (previous?.lastSeenSeq != null)
            'last_seen_seq': previous!.lastSeenSeq,
          if (previous?.rebaselinedAt != null)
            'rebaselined_at': previous!.rebaselinedAt!.toIso8601String(),
        }),
      ),
    );
  }

  /// Logout, account switch and lost access erase every user's cache.
  @override
  Future<void> clear() async {
    final root = await _root();
    if (root.existsSync()) await root.delete(recursive: true);
  }

  Future<StoredEventCursor?> readCursor() async {
    final dir = await _userDirectory();
    if (dir == null) return null;
    final meta = await _previousMeta(dir);
    final seq = meta?.lastSeenSeq;
    return seq == null
        ? null
        : StoredEventCursor(
            lastSeenSeq: seq,
            rebaselinedAt: meta!.rebaselinedAt,
          );
  }

  /// Updates the cursor beside the cached snapshot; without one it is a no-op,
  /// because the cursor is only meaningful for the export it was seen against.
  Future<void> writeCursor(StoredEventCursor cursor) async {
    RangeError.checkNotNegative(cursor.lastSeenSeq, 'lastSeenSeq');
    final dir = await _userDirectory();
    if (dir == null) return;
    final raw = await _readMetaMap(dir);
    if (raw == null || _readMeta(jsonEncode(raw)) == null) return;
    raw['last_seen_seq'] = cursor.lastSeenSeq;
    if (cursor.rebaselinedAt == null) {
      raw.remove('rebaselined_at');
    } else {
      raw['rebaselined_at'] = cursor.rebaselinedAt!.toUtc().toIso8601String();
    }
    await _atomicWrite('${dir.path}/meta.json', utf8.encode(jsonEncode(raw)));
  }

  Future<Map<String, dynamic>?> _readMetaMap(Directory dir) async {
    try {
      final decoded = jsonDecode(
        await File('${dir.path}/meta.json').readAsString(),
      );
      return decoded is Map<String, dynamic> ? decoded : null;
    } on Object {
      return null;
    }
  }

  Future<_Meta?> _previousMeta(Directory dir) async {
    final raw = await _readMetaMap(dir);
    return raw == null ? null : _readMeta(jsonEncode(raw));
  }

  _Meta? _readMeta(String source) {
    final decoded = jsonDecode(source);
    if (decoded is! Map<String, dynamic> || decoded['schema'] != _metaSchema) {
      return null;
    }
    final digest = decoded['digest'];
    final sha = decoded['snapshot_sha256'];
    final length = decoded['bytes'];
    final receivedAt = decoded['received_at'] is String
        ? DateTime.tryParse(decoded['received_at'] as String)
        : null;
    final seq = decoded['last_seen_seq'];
    final rebaselined = decoded['rebaselined_at'] is String
        ? DateTime.tryParse(decoded['rebaselined_at'] as String)
        : null;
    if (digest is! String ||
        !_hex64.hasMatch(digest) ||
        sha is! String ||
        !_hex64.hasMatch(sha) ||
        length is! int ||
        receivedAt == null ||
        (seq != null && (seq is! int || seq < 0))) {
      return null;
    }
    return _Meta(
      digest: digest,
      sha256: sha,
      length: length,
      receivedAt: receivedAt.toUtc(),
      lastSeenSeq: seq as int?,
      rebaselinedAt: rebaselined?.toUtc(),
    );
  }

  Future<void> _atomicWrite(String path, List<int> bytes) async {
    final temp = File('$path.tmp');
    await temp.writeAsBytes(bytes, flush: true);
    await temp.rename(path);
  }

  Future<void> _discard(Directory dir) async {
    try {
      if (dir.existsSync()) await dir.delete(recursive: true);
    } on Object {
      /* A cache that cannot be removed is still never trusted. */
    }
  }

  /// One account's cache must not outlive a switch to another account.
  Future<void> _pruneOtherUsers(Directory keep) async {
    final root = await _root();
    if (!root.existsSync()) return;
    await for (final entity in root.list(followLinks: false)) {
      if (entity.path != keep.path) {
        await entity.delete(recursive: true);
      }
    }
  }
}

final class _Meta {
  const _Meta({
    required this.digest,
    required this.sha256,
    required this.length,
    required this.receivedAt,
    this.lastSeenSeq,
    this.rebaselinedAt,
  });
  final String digest;
  final String sha256;
  final int length;
  final DateTime receivedAt;
  final int? lastSeenSeq;
  final DateTime? rebaselinedAt;
}
