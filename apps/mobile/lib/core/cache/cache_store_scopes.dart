part of 'cache_store.dart';

extension CacheStoreNamespaceScopes on CacheStore {
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
