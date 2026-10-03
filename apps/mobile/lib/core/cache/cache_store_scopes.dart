part of 'cache_store.dart';

extension CacheStoreNamespaceScopes on CacheStore {
  Future<void> _clearScopeSerialized({
    String? userId,
    String? workspaceId,
    String? namespace,
    bool resourceOnly = false,
  }) async {
    _refreshTasks.removeWhere(
      (_, task) =>
          (userId == null || task.key.userId == userId) &&
          (workspaceId == null || task.key.workspaceId == workspaceId) &&
          (namespace == null || task.key.namespace == namespace),
    );
    final scope = (userId, workspaceId, namespace);
    _scopeRevisions[scope] = ++_revision;
    _clearingScopes[scope] = (_clearingScopes[scope] ?? 0) + 1;
    try {
      await _serializePending(() async {
        await init();
        final keysToDelete = <String>[];
        for (final entry in _memory.entries) {
          final record = entry.value;
          final matchesUser = userId == null || record.userId == userId;
          final matchesWorkspace =
              workspaceId == null || record.workspaceId == workspaceId;
          if (matchesUser &&
              matchesWorkspace &&
              (namespace == null || record.namespace == namespace)) {
            keysToDelete.add(entry.key);
          }
        }

        for (final key in keysToDelete) {
          _dropRecord(key);
          await _resourceBox.delete(key);
          await _replicaMigration;
          await _removeReplicaSource(key);
        }

        // Resource-only purges must preserve unrelated queued offline changes.
        if (namespace != null || resourceOnly) return;
        final mutationIds = <dynamic>[];
        for (final dynamic key in _mutationBox.keys) {
          final raw = _mutationBox.get(key);
          if (raw is! Map<dynamic, dynamic>) continue;
          final matchesUser = userId == null || raw['userId'] == userId;
          final matchesWorkspace =
              workspaceId == null || raw['workspaceId'] == workspaceId;
          if (matchesUser && matchesWorkspace) {
            mutationIds.add(key);
          }
        }
        for (final id in mutationIds) {
          await _mutationBox.delete(id);
        }
        await _clearReplicaMappingsScope(userId, workspaceId);
      });
    } finally {
      _scopeRevisions[scope] = ++_revision;
      final remaining = _clearingScopes[scope]! - 1;
      if (remaining == 0) {
        _clearingScopes.remove(scope);
      } else {
        _clearingScopes[scope] = remaining;
      }
    }
  }

  /// Clears a family of encrypted resources without deleting another module's
  /// snapshots or the workspace's unsynchronized outbox.
  Future<void> clearNamespacePrefix({
    required String prefix,
    required String workspaceId,
    String? userId,
  }) async {
    await init();
    final namespaces = _memory.values
        .where(
          (record) =>
              record.workspaceId == workspaceId &&
              (userId == null || record.userId == userId) &&
              record.namespace.startsWith(prefix),
        )
        .map((record) => record.namespace)
        .toSet();
    for (final namespace in namespaces) {
      await clearScope(
        userId: userId,
        workspaceId: workspaceId,
        namespace: namespace,
      );
    }
  }
}
