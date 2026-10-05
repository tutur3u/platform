part of 'cache_store.dart';

extension CacheStoreStorage on CacheStore {
  Future<CacheStorageSnapshot> storageSnapshot({
    String? userId,
    String? workspaceId,
  }) async {
    await init();
    final categories = <CacheStorageCategory, int>{};
    for (final raw in _resourceBox.values) {
      if (raw is! Map) continue;
      CachedResourceRecord record;
      try {
        record = CachedResourceRecord.fromJson(raw);
      } on Object {
        continue;
      }
      if ((userId != null && record.userId != userId) ||
          (workspaceId != null && record.workspaceId != workspaceId)) {
        continue;
      }
      final bytes = utf8.encode(record.jsonPayload).length;
      final category = CacheStorageCategory.forNamespace(record.namespace);
      categories[category] = (categories[category] ?? 0) + bytes;
    }
    for (final raw in _entityBox.values) {
      if (raw is! Map ||
          raw['payload'] == null ||
          (userId != null && raw['userId'] != userId) ||
          (workspaceId != null && raw['workspaceId'] != workspaceId)) {
        continue;
      }
      final bytes = utf8.encode(jsonEncode(raw['payload'])).length;
      final category = CacheStorageCategory.forNamespace(
        raw['namespace'] as String? ?? '',
      );
      categories[category] = (categories[category] ?? 0) + bytes;
    }
    return CacheStorageSnapshot(
      totalBytes: categories.values.fold(0, (sum, bytes) => sum + bytes),
      maxBytes: _maxBytes,
      categoryBytes: Map.unmodifiable(categories),
    );
  }

  Future<CacheStorageSnapshot> storageLimitSnapshot() async {
    await init();
    return CacheStorageSnapshot(
      totalBytes: 0,
      maxBytes: _maxBytes,
      categoryBytes: const {},
    );
  }

  Future<void> setMaxStorageBytes(int bytes) async {
    if (!CacheStore.allowedMaxBytes.contains(bytes)) {
      throw ArgumentError.value(bytes, 'bytes', 'Unsupported cache limit');
    }
    await init();
    await _replicaMigration;
    await _serializeResources(() async {
      await _secureStorage.write(
        key: CacheStore._maxBytesStorageKey,
        value: '$bytes',
      );
      _maxBytes = bytes;
      await _pruneResourceCache();
    });
  }

  Future<void> clearResourceCache() => clearScope(resourceOnly: true);

  @visibleForTesting
  Future<void> pruneForTesting(int limit) async {
    await init();
    await _replicaMigration;
    await _serializeResources(() async {
      final previous = _maxBytes;
      _maxBytes = limit;
      try {
        await _pruneResourceCache();
      } finally {
        _maxBytes = previous;
      }
    });
  }

  Future<void> _pruneResourceCache() async {
    if (_resourceBytes + _entityBytes <= _maxBytes) return;
    await _replicaMigration;
    final now = DateTime.now();
    final records = _memory.values.toList(growable: false)
      ..sort((a, b) {
        final aExpired = !now.isBefore(a.expireAt);
        final bExpired = !now.isBefore(b.expireAt);
        if (aExpired != bExpired) return aExpired ? -1 : 1;
        return a.fetchedAt.compareTo(b.fetchedAt);
      });
    var projectedBytes = _resourceBytes + _entityBytes;
    final selected = <CachedResourceRecord>[];
    for (final record in records) {
      if (projectedBytes <= _maxBytes && now.isBefore(record.expireAt)) break;
      selected.add(record);
      final index = _entityBox.get(_replicaSourceKey(record.key));
      final replicaBytes = ((index as List?)?.whereType<String>() ?? <String>[])
          .fold<int>(
            0,
            (sum, key) => sum + _replicaPayloadBytes(_entityBox.get(key)),
          );
      projectedBytes -= utf8.encode(record.jsonPayload).length + replicaBytes;
    }
    final keys = {
      for (final record in selected) record.key: _keyForRecord(record),
    };
    final journal = await _beginResourceDeletion(keys.values);
    try {
      for (final record in selected) {
        _advanceKey(record.key);
        _dropRecord(record.key);
        await _resourceBox.delete(record.key);
        await _removeReplicaSource(record.key);
        await persistenceCheckpoint?.call('pruning');
      }
    } on Object catch (error) {
      if (error is CachePersistenceInterruption) rethrow;
      await _restoreResourceJournal(journal, restore: (_) => false);
      rethrow;
    }
    await _finishResourceJournal(journal);
    for (final record in selected) {
      _dropRecord(record.key);
    }
  }
}
