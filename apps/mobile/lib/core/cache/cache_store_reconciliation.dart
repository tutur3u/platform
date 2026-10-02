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
    for (final record in stale) {
      checkScope();
      _advanceKey(record.key);
      _refreshTasks.remove(record.key);
      _dropRecord(record.key);
      await _resourceBox.delete(record.key);
      await _removeReplicaSource(record.key);
    }
    checkScope();
  }
}
