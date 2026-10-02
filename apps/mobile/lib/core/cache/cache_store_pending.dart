part of 'cache_store.dart';

extension CacheStorePending on CacheStore {
  Future<T> _serializePending<T>(
    String id,
    Future<T> Function() operation,
  ) async {
    final previous = _pendingWrites[id];
    final released = Completer<void>();
    _pendingWrites[id] = released.future;
    try {
      await previous;
      await init();
      return await operation();
    } finally {
      released.complete();
      if (identical(_pendingWrites[id], released.future)) {
        unawaited(_pendingWrites.remove(id));
      }
    }
  }

  /// Atomic read/modify/write prevents metadata publication from replacing a
  /// newer acknowledgment. A canceled record is never recreated by an update.
  Future<PendingMutationRecord?> updatePendingMutation(
    String id,
    PendingMutationRecord Function(PendingMutationRecord) update,
  ) => _serializePending(id, () async {
    final raw = _mutationBox.get(id);
    if (raw is! Map) return null;
    final record = update(PendingMutationRecord.fromJson(raw));
    await _mutationBox.put(id, record.toJson());
    return record;
  });

  Future<void> savePendingMutation(PendingMutationRecord record) =>
      _serializePending(
        record.id,
        () => _mutationBox.put(record.id, record.toJson()),
      );

  Future<void> deletePendingMutation(String id) =>
      _serializePending(id, () => _mutationBox.delete(id));

  Future<List<PendingMutationRecord>> listPendingMutations() async {
    await init();
    final records = <PendingMutationRecord>[];
    for (final key in _mutationBox.keys) {
      final raw = _mutationBox.get(key);
      if (raw is Map<dynamic, dynamic>) {
        records.add(PendingMutationRecord.fromJson(raw));
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
