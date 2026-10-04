part of 'cache_store.dart';

extension CacheStorePending on CacheStore {
  // One barrier also serializes account/workspace purges against every record.
  Future<T> _serializePending<T>(Future<T> Function() operation) async {
    final previous = _pendingWrite;
    final released = Completer<void>();
    _pendingWrite = released.future;
    try {
      await previous;
      await init();
      return await operation();
    } finally {
      // Publish completion, never the operation error, to the next waiter.
      released.complete();
      if (identical(_pendingWrite, released.future)) {
        _pendingWrite = null;
      }
    }
  }

  /// Atomic read/modify/write prevents metadata publication from replacing a
  /// newer acknowledgment. A canceled record is never recreated by an update.
  Future<PendingMutationRecord?> updatePendingMutation(
    String id,
    PendingMutationRecord Function(PendingMutationRecord) update,
  ) => _serializePending(() async {
    final raw = _mutationBox.get(id);
    if (raw is! Map) return null;
    final record = update(PendingMutationRecord.fromJson(raw));
    await _mutationBox.put(id, record.toJson());
    return record;
  });

  Future<void> savePendingMutation(
    PendingMutationRecord record, {
    void Function()? checkScope,
  }) => _serializePending(() async {
    checkScope?.call();
    await _mutationBox.put(record.id, record.toJson());
    checkScope?.call();
  });

  Future<void> deletePendingMutation(String id) =>
      _serializePending(() => _mutationBox.delete(id));

  Future<List<PendingMutationRecord>> listPendingMutations() async {
    await init();
    final records = <PendingMutationRecord>[];
    for (final key in _mutationBox.keys) {
      final raw = _mutationBox.get(key);
      if (raw is Map<dynamic, dynamic>) {
        try {
          records.add(PendingMutationRecord.fromJson(raw));
        } on Object {
          // Preserve the encrypted original while isolating it from replay.
          records.add(
            PendingMutationRecord(
              id: key.toString(),
              feature: raw['feature'] is String
                  ? raw['feature'] as String
                  : 'unknown',
              method: 'INVALID',
              path: '',
              createdAt: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
              userId: raw['userId'] is String ? raw['userId'] as String : null,
              workspaceId: raw['workspaceId'] is String
                  ? raw['workspaceId'] as String
                  : null,
              status: PendingMutationStatus.conflict,
              dependencyIssue: OfflineDependencyIssue.invalidPayload,
            ),
          );
        }
      }
    }
    final positions = {
      for (var i = 0; i < records.length; i++) records[i].id: i,
    };
    records.sort((left, right) {
      final time = left.createdAt.compareTo(right.createdAt);
      return time != 0
          ? time
          : positions[left.id]!.compareTo(positions[right.id]!);
    });
    return records;
  }
}
