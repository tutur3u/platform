import 'dart:typed_data';

abstract interface class MastermindSnapshotStore {
  Future<StoredSnapshot?> read();
  Future<void> write(
    Uint8List bytes,
    DateTime receivedAt, {
    required String digest,
  });
  Future<void> clear();
}

final class StoredSnapshot {
  StoredSnapshot(Uint8List bytes, this.receivedAt, {required this.digest})
    : bytes = Uint8List.fromList(bytes).asUnmodifiableView();
  final Uint8List bytes;
  final DateTime receivedAt;
  final String digest;
}

/// Process-local only; the owner clears this store on workspace/actor changes.
final class MemorySnapshotStore implements MastermindSnapshotStore {
  StoredSnapshot? _snapshot;
  @override
  Future<StoredSnapshot?> read() async => _snapshot;
  @override
  Future<void> write(
    Uint8List bytes,
    DateTime receivedAt, {
    required String digest,
  }) async {
    _snapshot = StoredSnapshot(bytes, receivedAt, digest: digest);
  }

  @override
  Future<void> clear() async => _snapshot = null;
}
