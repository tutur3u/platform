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
        await _replicaMigration;
        await _serializeResources(() async {
          final intentKey = '@clear:${++_journalSequence}';
          final intent = <String, dynamic>{
            'kind': 'resource-clear',
            'userId': userId,
            'workspaceId': workspaceId,
            'namespace': namespace,
            'resourceOnly': resourceOnly,
          };
          await _entityBox.put(intentKey, intent);
          _resourceJournalCount++;
          await _entityBox.flush();
          for (final record in _memory.values.toList(growable: false)) {
            if (_matchesClear(record.toJson(), intent)) {
              _dropRecord(record.key);
            }
          }
          await persistenceCheckpoint?.call('clear-intent');
          // Recover unfinished publications while this durable clear intent
          // still exists, so completing a clear cannot leave a resurrector.
          await _recoverResourceJournals();
          await _applyClearIntent(intent);
          for (final record in _memory.values.toList(growable: false)) {
            if (_matchesClear(record.toJson(), intent)) _dropRecord(record.key);
          }
          _entityBytes = _countReplicaBytes();
          await _finishResourceJournal(
            intentKey,
            mutationsChanged: namespace == null && !resourceOnly,
          );
        });
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
