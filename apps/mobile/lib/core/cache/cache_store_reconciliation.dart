part of 'cache_store.dart';

extension CacheStoreCompletedDownload on CacheStore {
  /// Removes obsolete snapshots only after an authoritative download completes.
  /// Exact namespaces protect partial collections and unrelated cached modules.
  Future<void> reconcileCompletedNamespaces({
    required String userId,
    required String workspaceId,
    required Set<String> namespaces,
    required Set<String> retainedKeys,
    required void Function() checkScope,
  }) async {
    await init();
    await _replicaMigration;
    await _serializeResources(() async {
      if (_resourceJournalCount > 0) await _recoverResourceJournals();
      checkScope();
      final stale = _memory.values
          .where(
            (record) =>
                record.userId == userId &&
                record.workspaceId == workspaceId &&
                namespaces.contains(record.namespace) &&
                !retainedKeys.contains(record.key),
          )
          .toList(growable: false);
      final keys = {
        for (final record in stale)
          record.key: CacheKey(
            namespace: record.namespace,
            userId: record.userId,
            workspaceId: record.workspaceId,
            locale: record.locale,
            schemaVersion: record.schemaVersion,
            params: record.params,
          ),
      };
      final journal = await _beginResourceDeletion(keys.values);
      try {
        for (final record in stale) {
          checkScope();
          final key = keys[record.key]!;
          if (_isClearing(key)) continue;
          _advanceKey(record.key);
          _refreshTasks.remove(record.key);
          _dropRecord(record.key);
          await _resourceBox.delete(record.key);
          await _removeReplicaSource(record.key);
          await persistenceCheckpoint?.call('reconciliation');
        }
        checkScope();
      } on Object catch (error) {
        if (error is CachePersistenceInterruption) rethrow;
        await _restoreResourceJournal(journal, restore: (_) => false);
        rethrow;
      }
      await _finishResourceJournal(journal);
    });
  }
}
