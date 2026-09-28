part of 'cache_store.dart';

const _replicaSchemaKey = '@schema-version';
const _replicaSchemaVersion = 1;
const _replicaIdMapPrefix = '@id-map:';

extension CacheStoreReplica on CacheStore {
  Future<void> saveLocalIdMapping({
    required String userId,
    required String workspaceId,
    required String feature,
    required String localId,
    required String serverId,
  }) async {
    await init();
    final identity = '$userId|$workspaceId|$feature|$localId';
    final key = '$_replicaIdMapPrefix${sha256.convert(utf8.encode(identity))}';
    await _entityBox.put(key, {
      'kind': 'id-map',
      'userId': userId,
      'workspaceId': workspaceId,
      'feature': feature,
      'localId': localId,
      'serverId': serverId,
    });
  }

  Future<Map<String, String>> localIdMappings({
    required String userId,
    required String workspaceId,
    required String feature,
  }) async {
    await init();
    final ids = <String, String>{};
    for (final raw in _entityBox.values) {
      if (raw is Map &&
          raw['kind'] == 'id-map' &&
          raw['userId'] == userId &&
          raw['workspaceId'] == workspaceId &&
          raw['feature'] == feature &&
          raw['localId'] is String &&
          raw['serverId'] is String) {
        ids[raw['localId'] as String] = raw['serverId'] as String;
      }
    }
    return ids;
  }

  Future<void> _clearReplicaMappingsScope(
    String? userId,
    String? workspaceId,
  ) async {
    final keys = <dynamic>[];
    for (final key in _entityBox.keys) {
      final raw = _entityBox.get(key);
      if (raw is Map &&
          raw['kind'] == 'id-map' &&
          (userId == null || raw['userId'] == userId) &&
          (workspaceId == null || raw['workspaceId'] == workspaceId)) {
        keys.add(key);
      }
    }
    for (final key in keys) {
      await _entityBox.delete(key);
    }
  }

  int _replicaPayloadBytes(Object? raw) => raw is Map && raw['payload'] != null
      ? utf8.encode(jsonEncode(raw['payload'])).length
      : 0;

  int _countReplicaBytes() {
    var total = 0;
    for (final raw in _entityBox.values) {
      total += _replicaPayloadBytes(raw);
    }
    return total;
  }

  String _replicaSourceKey(String sourceKey) =>
      '@source:${sha256.convert(utf8.encode(sourceKey))}';

  String _replicaEntityKey(CachedResourceRecord source, String id) =>
      '@entity:${sha256.convert(utf8.encode('${source.key}|$id'))}';

  Iterable<Map<String, dynamic>> _extractReplicaRows(Object? value) sync* {
    if (value is List) {
      for (final row in value.take(1000)) {
        if (row is Map && row['id'] is String) {
          yield Map<String, dynamic>.from(row);
        }
      }
      return;
    }
    if (value is! Map) return;
    if (value['id'] is String) {
      yield Map<String, dynamic>.from(value);
      return;
    }
    for (final nested in value.values) {
      if (nested is List) yield* _extractReplicaRows(nested);
    }
  }

  bool _replicaCanIndex(CachedResourceRecord source) =>
      source.userId != null &&
      !CacheStore._nonPersistentResourceNamespaces.contains(source.namespace) &&
      !source.namespace.contains('secret') &&
      !source.namespace.contains('token');

  Future<void> _replaceReplicaSource(CachedResourceRecord source) async {
    final sourceIndexKey = _replicaSourceKey(source.key);
    final previous =
        (_entityBox.get(sourceIndexKey) as List?)?.whereType<String>().toList(
          growable: false,
        ) ??
        const <String>[];
    final next = <String, Map<String, dynamic>>{};
    final priorBytes = previous.fold<int>(
      0,
      (total, key) => total + _replicaPayloadBytes(_entityBox.get(key)),
    );
    if (_replicaCanIndex(source)) {
      try {
        for (final row in _extractReplicaRows(jsonDecode(source.jsonPayload))) {
          final id = row['id'] as String;
          if (id.isEmpty || id.length > 255) continue;
          final key = _replicaEntityKey(source, id);
          next[key] = ReplicaEntityRecord(
            id: id,
            namespace: source.namespace,
            sourceKey: source.key,
            payload: row,
            fetchedAt: source.fetchedAt,
            userId: source.userId,
            workspaceId: source.workspaceId,
          ).toJson();
        }
      } on Object {
        // A corrupt or non-entity snapshot should not interrupt cache writes.
      }
    }
    try {
      await _entityBox.putAll(next);
      await _entityBox.put(sourceIndexKey, next.keys.toList(growable: false));
      for (final key in previous) {
        if (!next.containsKey(key)) await _entityBox.delete(key);
      }
      _entityBytes +=
          next.values.fold<int>(
            0,
            (total, raw) => total + _replicaPayloadBytes(raw),
          ) -
          priorBytes;
    } on Object {
      _entityBytes = _countReplicaBytes();
      rethrow;
    }
  }

  Future<void> _removeReplicaSource(String sourceKey) async {
    final indexKey = _replicaSourceKey(sourceKey);
    final keys =
        (_entityBox.get(indexKey) as List?)?.whereType<String>() ??
        const <String>[];
    final priorBytes = keys.fold<int>(
      0,
      (total, key) => total + _replicaPayloadBytes(_entityBox.get(key)),
    );
    try {
      for (final key in keys) {
        await _entityBox.delete(key);
      }
      await _entityBox.delete(indexKey);
      _entityBytes -= priorBytes;
    } on Object {
      _entityBytes = _countReplicaBytes();
      rethrow;
    }
  }

  Future<void> _migrateReplicaFromSnapshots() async {
    if (_entityBox.get(_replicaSchemaKey) == _replicaSchemaVersion) return;
    final snapshots = _memory.values.toList(growable: false)
      ..sort((a, b) => a.fetchedAt.compareTo(b.fetchedAt));
    for (final source in snapshots) {
      await _replaceReplicaSource(source);
    }
    await _entityBox.put(_replicaSchemaKey, _replicaSchemaVersion);
  }

  /// Query the encrypted local entity table without requiring a network call.
  /// Pending edits are overlaid by stable entity ID when a path discriminator
  /// is supplied by the owning repository.
  Future<List<ReplicaEntityRecord>> queryReplica({
    required String namespace,
    required String userId,
    String? workspaceId,
    String? pendingFeature,
    String? pendingPathContains,
    int? limit,
  }) async {
    await init();
    await _replicaMigration;
    final byId = <String, ReplicaEntityRecord>{};
    for (final raw in _entityBox.values) {
      if (raw is! Map || raw['id'] is! String) continue;
      final row = ReplicaEntityRecord.fromJson(raw);
      if (row.namespace != namespace ||
          row.userId != userId ||
          row.workspaceId != workspaceId) {
        continue;
      }
      final previous = byId[row.id];
      if (previous == null || row.fetchedAt.isAfter(previous.fetchedAt)) {
        byId[row.id] = row;
      }
    }
    if (pendingFeature != null && pendingPathContains != null) {
      final pending = await listPendingMutations();
      for (final mutation in pending) {
        if (mutation.userId != userId ||
            mutation.workspaceId != workspaceId ||
            mutation.feature != pendingFeature ||
            !mutation.path.contains(pendingPathContains)) {
          continue;
        }
        final id = mutation.entityId;
        if (id == null) continue;
        if (mutation.method == 'DELETE') {
          byId.remove(id);
          continue;
        }
        byId[id] = ReplicaEntityRecord(
          id: id,
          namespace: namespace,
          sourceKey: 'pending:${mutation.id}',
          payload: {...?byId[id]?.payload, ...?mutation.payload, 'id': id},
          fetchedAt: mutation.createdAt,
          userId: userId,
          workspaceId: workspaceId,
          pendingStatus: mutation.status,
        );
      }
    }
    final rows = byId.values.toList(growable: false)
      ..sort((a, b) => b.fetchedAt.compareTo(a.fetchedAt));
    return limit == null ? rows : rows.take(limit).toList(growable: false);
  }

  @visibleForTesting
  Future<void> closeForTesting() async {
    if (!_initialized) return;
    await _replicaMigration;
    await _resourceBox.close();
    await _mutationBox.close();
    await _entityBox.close();
    _memory.clear();
    _resourceBytes = 0;
    _entityBytes = 0;
    _initialized = false;
    _initialization = null;
    _replicaMigration = null;
  }
}
