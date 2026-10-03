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
        jsonDecode(record.jsonPayload);
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

  Future<void> setMaxStorageBytes(int bytes) async {
    if (!CacheStore.allowedMaxBytes.contains(bytes)) {
      throw ArgumentError.value(bytes, 'bytes', 'Unsupported cache limit');
    }
    await init();
    await _secureStorage.write(
      key: CacheStore._maxBytesStorageKey,
      value: '$bytes',
    );
    _maxBytes = bytes;
    await _pruneResourceCache();
  }

  Future<void> clearResourceCache() => clearScope(resourceOnly: true);

  Future<void> _pruneResourceCache() async {
    if (_resourceBytes + _entityBytes <= _maxBytes) return;
    final now = DateTime.now();
    final surviving = <CachedResourceRecord>[];
    for (final record in _memory.values.toList(growable: false)) {
      if (!now.isBefore(record.expireAt)) {
        _advanceKey(record.key);
        _dropRecord(record.key);
        await _resourceBox.delete(record.key);
        await _replicaMigration;
        await _removeReplicaSource(record.key);
      } else {
        surviving.add(record);
      }
    }
    if (_resourceBytes + _entityBytes <= _maxBytes) return;
    surviving.sort((a, b) => a.fetchedAt.compareTo(b.fetchedAt));
    for (final record in surviving) {
      if (_resourceBytes + _entityBytes <= _maxBytes) break;
      _advanceKey(record.key);
      _dropRecord(record.key);
      await _resourceBox.delete(record.key);
      await _replicaMigration;
      await _removeReplicaSource(record.key);
    }
  }
}
