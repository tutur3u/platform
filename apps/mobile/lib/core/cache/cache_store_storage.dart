part of 'cache_store.dart';

extension CacheStoreStorage on CacheStore {
  Future<CacheStorageSnapshot> storageSnapshot() async {
    await init();
    final categories = <CacheStorageCategory, int>{};
    for (final record in _memory.values) {
      final bytes = utf8.encode(record.jsonPayload).length;
      final category = CacheStorageCategory.forNamespace(record.namespace);
      categories[category] = (categories[category] ?? 0) + bytes;
    }
    return CacheStorageSnapshot(
      totalBytes: _resourceBytes,
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
    if (_resourceBytes <= _maxBytes) return;
    final now = DateTime.now();
    final surviving = <CachedResourceRecord>[];
    for (final record in _memory.values.toList(growable: false)) {
      if (!now.isBefore(record.expireAt)) {
        _advanceKey(record.key);
        _dropRecord(record.key);
        await _resourceBox.delete(record.key);
      } else {
        surviving.add(record);
      }
    }
    if (_resourceBytes <= _maxBytes) return;
    surviving.sort((a, b) => a.fetchedAt.compareTo(b.fetchedAt));
    for (final record in surviving) {
      if (_resourceBytes <= _maxBytes) break;
      _advanceKey(record.key);
      _dropRecord(record.key);
      await _resourceBox.delete(record.key);
    }
  }
}
