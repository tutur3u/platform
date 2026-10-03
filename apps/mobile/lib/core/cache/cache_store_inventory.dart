part of 'cache_store.dart';

extension CacheStoreInventory on CacheStore {
  /// Read disk, rather than memory, so failed persistence never inflates
  /// counts.
  /// Expiry affects freshness, not the availability of a retained offline row.
  Future<OfflineCacheInventory> offlineInventory({
    required String userId,
    required String workspaceId,
    required String moduleId,
  }) async {
    if (!const {
      'finance',
      'inventory',
      'tasks',
      'calendar',
    }.contains(moduleId)) {
      throw ArgumentError.value(moduleId, 'moduleId');
    }
    await init();
    await _replicaMigration;
    final sources = <String, CachedResourceRecord>{};
    for (final raw in _resourceBox.values) {
      if (raw is! Map) continue;
      try {
        final record = CachedResourceRecord.fromJson(raw);
        if (record.userId != userId ||
            record.workspaceId != workspaceId ||
            !record.namespace.startsWith('$moduleId.') ||
            !_replicaCanIndex(record)) {
          continue;
        }
        jsonDecode(
          record.jsonPayload,
        ); // Corrupt payloads are not available data.
        sources[record.key] = record;
      } on Object {
        // Do not expose corrupt/private resource contents or identifiers.
      }
    }
    final identities = <String, Set<String>>{};
    final entityBytes = <String, int>{};
    for (final raw in _entityBox.values) {
      if (raw is! Map || raw['payload'] == null) continue;
      try {
        final entity = ReplicaEntityRecord.fromJson(raw);
        final source = sources[entity.sourceKey];
        if (source == null ||
            source.namespace != entity.namespace ||
            entity.userId != userId ||
            entity.workspaceId != workspaceId) {
          continue;
        }
        (identities[entity.namespace] ??= {}).add(entity.id);
        // Bytes include duplicated persisted replicas; item counts do not.
        entityBytes.update(
          entity.namespace,
          (bytes) => bytes + utf8.encode(jsonEncode(entity.payload)).length,
          ifAbsent: () => utf8.encode(jsonEncode(entity.payload)).length,
        );
      } on Object {
        // Invalid replicas cannot establish an available item.
      }
    }
    final groups = <String, List<CachedResourceRecord>>{};
    for (final source in sources.values) {
      (groups[source.namespace] ??= []).add(source);
    }
    final pending = await listPendingMutations();
    return OfflineCacheInventory(
      pending: pending
          .where(
            (row) =>
                row.userId == userId &&
                row.workspaceId == workspaceId &&
                row.feature == moduleId,
          )
          .length,
      namespaces: [
        for (final name in groups.keys.toList()..sort())
          OfflineNamespaceInventory(
            namespace: name,
            serverReportedTotal: _consistentQueryTotal(
              groups[name]!,
              identities[name]?.length ?? 0,
            ),
            items: identities[name]?.length ?? 0,
            snapshots: groups[name]!.length,
            logicalBytes:
                groups[name]!.fold<int>(
                  0,
                  (bytes, row) => bytes + utf8.encode(row.jsonPayload).length,
                ) +
                (entityBytes[name] ?? 0),
            staleSnapshots: groups[name]!
                .where((row) => !row.isFresh && !row.isExpired)
                .length,
            expiredSnapshots: groups[name]!
                .where((row) => row.isExpired)
                .length,
            lastFetch: groups[name]!
                .map((row) => row.fetchedAt)
                .reduce((a, b) => a.isAfter(b) ? a : b),
          ),
      ],
    );
  }
}

int? _consistentQueryTotal(
  List<CachedResourceRecord> sources,
  int availableItems,
) {
  final totals = <int>{};
  final queries = <String>{};
  for (final source in sources) {
    final query = {...source.params}
      ..removeWhere(
        (key, _) => const {
          'page',
          'pageSize',
          'limit',
          'offset',
          'cursor',
        }.contains(key),
      );
    final sortedKeys = query.keys.toList()..sort();
    queries.add(jsonEncode({for (final key in sortedKeys) key: query[key]}));
    final payload = jsonDecode(source.jsonPayload);
    if (payload is! Map) return null;
    final total = payload['totalCount'] ?? payload['total'];
    if (total is! int || total < 0) return null;
    totals.add(total);
  }
  return queries.length == 1 &&
          totals.length == 1 &&
          totals.single >= availableItems
      ? totals.single
      : null;
}
