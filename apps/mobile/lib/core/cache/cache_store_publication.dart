part of 'cache_store.dart';

extension CacheStorePublication on CacheStore {
  CacheKey _keyForRecord(CachedResourceRecord record) => CacheKey(
    namespace: record.namespace,
    userId: record.userId,
    workspaceId: record.workspaceId,
    locale: record.locale,
    schemaVersion: record.schemaVersion,
    params: record.params,
  );
  // Snapshot, index, eviction and reconciliation share one ordering boundary.
  // Scope/key fences advance before admission so queued old reads cannot return.
  Future<T> _serializeResources<T>(Future<T> Function() operation) async {
    final previous = _resourceWrite;
    final released = Completer<void>();
    _resourceWrite = released.future;
    try {
      await previous;
      return await operation();
    } finally {
      released.complete();
      if (identical(_resourceWrite, released.future)) _resourceWrite = null;
    }
  }

  Future<void> _removeCorruptRecord(CachedResourceRecord record) =>
      _serializeResources(() async {
        if (!identical(_memory[record.key], record)) return;
        // Corruption is a missing snapshot, not an actor or mutation fence.
        // Do not invalidate the fresh network request that discovered it.
        _dropRecord(record.key);
        await _resourceBox.delete(record.key);
        await _removeReplicaSource(record.key);
      });

  Future<void> _publishResource({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    required int expectedRevision,
    String? etag,
    List<String> tags = const [],
    void Function()? checkScope,
  }) async {
    if (_resourceJournalCount > 0) await _recoverResourceJournals();
    checkScope?.call();
    if (_isClearing(key) || expectedRevision != _revisionFor(key)) return;
    void checkCurrent() {
      checkScope?.call();
      if (_isClearing(key) || expectedRevision != _revisionFor(key)) {
        throw StateError('Cache write was invalidated.');
      }
    }

    if (CacheStore._nonPersistentResourceNamespaces.contains(key.namespace)) {
      _dropRecord(key.value);
      await _resourceBox.delete(key.value);
      await _removeReplicaSource(key.value);
      return;
    }
    final now = DateTime.now();
    final record = CachedResourceRecord(
      key: key.value,
      namespace: key.namespace,
      jsonPayload: jsonEncode(payload),
      fetchedAt: now,
      staleAt: now.add(policy.staleAfter),
      expireAt: now.add(policy.expireAfter),
      userId: key.userId,
      workspaceId: key.workspaceId,
      locale: key.locale,
      schemaVersion: key.schemaVersion,
      etag: etag,
      tags: tags,
      params: key.params,
    );
    final scopeRevisions = {
      for (final scope in _scopes(key)) scope: _scopeRevisions[scope] ?? 0,
    };
    final journal = await _beginResourceJournal([key]);
    try {
      await _resourceBox.put(key.value, record.toJson());
      await persistenceCheckpoint?.call('snapshot');
      checkCurrent();
      await _replaceReplicaSource(record, checkCurrent: checkCurrent);
      checkCurrent();
    } on Object catch (error) {
      if (error is CachePersistenceInterruption) rethrow;
      await _restoreResourceJournal(
        journal,
        restore: (_) {
          try {
            checkScope?.call();
            // Tag/key invalidation rejects the attempted response but retains
            // the last authorized snapshot. Only actor/scope clears erase it.
            return !_isClearing(key) &&
                scopeRevisions.entries.every(
                  (entry) => (_scopeRevisions[entry.key] ?? 0) == entry.value,
                );
          } on Object {
            return false;
          }
        },
      );
      rethrow;
    }
    await _finishResourceJournal(journal);
    // Readers see the response only after the whole index has been published.
    _putRecord(record);
    await _pruneResourceCache();
  }
}
