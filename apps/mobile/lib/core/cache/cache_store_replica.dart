part of 'cache_store.dart';

const _replicaSchemaKey = '@schema-version';
const _replicaSchemaVersion = 1;
const _replicaIdMapPrefix = '@id-map:';

extension CacheStoreReplica on CacheStore {
  /// Provenance survives cancellation so stale editors never send local UUIDs.
  Future<void> registerLocalResource(OfflineResourceReference reference) async {
    await init();
    final identity = jsonEncode(reference.toJson());
    await _entityBox.put(
      '@local-origin:${sha256.convert(utf8.encode(identity))}',
      {'kind': 'local-origin', ...reference.toJson()},
    );
  }

  Future<Set<OfflineResourceReference>> localResourceOrigins({
    required String userId,
    required String workspaceId,
  }) async {
    await init();
    return _entityBox.values
        .whereType<Map<dynamic, dynamic>>()
        .where(
          (raw) =>
              {'local-origin', 'local-deleted'}.contains(raw['kind']) &&
              raw['userId'] == userId &&
              raw['workspaceId'] == workspaceId,
        )
        .map(_parseOfflineReference)
        .whereType<OfflineResourceReference>()
        .toSet();
  }

  OfflineResourceReference? _parseOfflineReference(Map<dynamic, dynamic> raw) {
    try {
      return OfflineResourceReference.fromJson(raw);
    } on Object {
      return null;
    }
  }

  Future<void> saveLocalIdMapping({
    required String userId,
    required String workspaceId,
    required String feature,
    required String localId,
    required String serverId,
    Map<String, dynamic>? resourceData,
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
      if (resourceData != null) 'resourceData': resourceData,
    });
  }

  Future<Map<String, dynamic>?> localResourceAcknowledgment(
    OfflineResourceReference reference,
  ) async {
    await init();
    final identity =
        '${reference.userId}|${reference.workspaceId}|'
        '${reference.mappingNamespace}|${reference.localId}';
    final key = '$_replicaIdMapPrefix${sha256.convert(utf8.encode(identity))}';
    final raw = _entityBox.get(key);
    if (raw is! Map || raw['deleted'] == true) return null;
    final data = raw['resourceData'];
    return data is Map ? Map<String, dynamic>.from(data) : null;
  }

  Future<Set<OfflineResourceReference>> deletedOfflineResources({
    required String userId,
    required String workspaceId,
  }) async {
    await init();
    return _entityBox.values
        .whereType<Map<dynamic, dynamic>>()
        .where(
          (raw) =>
              raw['kind'] == 'local-deleted' &&
              raw['userId'] == userId &&
              raw['workspaceId'] == workspaceId,
        )
        .map(_parseOfflineReference)
        .whereType<OfflineResourceReference>()
        .toSet();
  }

  Future<void> tombstoneOfflineResource(
    OfflineResourceReference reference,
    String serverId,
  ) async {
    await init();
    final aliases = {
      reference,
      OfflineResourceReference(
        userId: reference.userId,
        workspaceId: reference.workspaceId,
        feature: reference.feature,
        resource: reference.resource,
        localId: serverId,
      ),
    };
    final writes = <String, Map<dynamic, dynamic>>{};
    for (final alias in aliases) {
      final identity = jsonEncode(alias.toJson());
      writes['@local-deleted:${sha256.convert(utf8.encode(identity))}'] = {
        'kind': 'local-deleted',
        ...alias.toJson(),
      };
    }
    for (final key in _entityBox.keys.whereType<String>()) {
      final raw = _entityBox.get(key);
      if (raw is Map &&
          raw['kind'] == 'id-map' &&
          raw['userId'] == reference.userId &&
          raw['workspaceId'] == reference.workspaceId &&
          raw['feature'] == reference.mappingNamespace &&
          raw['serverId'] == serverId) {
        writes[key] = {...raw, 'deleted': true};
      }
    }
    await _entityBox.putAll(writes);
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
          raw['deleted'] != true &&
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

  /// Resolves references that cross modules, such as a Note mentioning a
  /// locally created Task, within the same account and workspace only.
  Future<Map<String, String>> localIdMappingsForScope({
    required String userId,
    required String workspaceId,
  }) async {
    await init();
    final ids = <String, String>{};
    for (final raw in _entityBox.values) {
      if (raw is Map &&
          raw['kind'] == 'id-map' &&
          raw['deleted'] != true &&
          raw['userId'] == userId &&
          raw['workspaceId'] == workspaceId &&
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
          {'id-map', 'local-origin', 'local-deleted'}.contains(raw['kind']) &&
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
        if (row is Map) {
          final id = row['id'] ?? row['auditRecordId'];
          if (id is String) yield {...Map<String, dynamic>.from(row), 'id': id};
        }
      }
      return;
    }
    if (value is! Map) return;
    final id = value['id'] ?? value['auditRecordId'];
    if (id is String) {
      yield {...Map<String, dynamic>.from(value), 'id': id};
      return;
    }
    for (final nested in value.values) {
      if (nested is List || nested is Map) yield* _extractReplicaRows(nested);
    }
  }

  bool _replicaCanIndex(CachedResourceRecord source) =>
      source.userId != null &&
      !CacheStore._nonPersistentResourceNamespaces.contains(source.namespace) &&
      !source.namespace.contains('secret') &&
      !source.namespace.contains('token');

  Future<void> _serializeReplicaSource(
    String sourceKey,
    Future<void> Function() operation,
  ) async {
    final previous = _replicaWrites[sourceKey];
    final released = Completer<void>();
    _replicaWrites[sourceKey] = released.future;
    try {
      await previous;
      await operation();
    } finally {
      released.complete();
      if (identical(_replicaWrites[sourceKey], released.future)) {
        unawaited(_replicaWrites.remove(sourceKey));
      }
    }
  }

  Future<void> _replaceReplicaSource(
    CachedResourceRecord source, {
    void Function()? checkCurrent,
  }) => _serializeReplicaSource(
    source.key,
    () => _replaceReplicaSourceUnlocked(source, checkCurrent: checkCurrent),
  );

  Future<void> _replaceReplicaSourceUnlocked(
    CachedResourceRecord source, {
    void Function()? checkCurrent,
  }) async {
    checkCurrent?.call();
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
      checkCurrent?.call();
      await _entityBox.put(sourceIndexKey, next.keys.toList(growable: false));
      checkCurrent?.call();
      for (final key in previous) {
        if (!next.containsKey(key)) {
          await _entityBox.delete(key);
          checkCurrent?.call();
        }
      }
      _entityBytes +=
          next.values.fold<int>(
            0,
            (total, raw) => total + _replicaPayloadBytes(raw),
          ) -
          priorBytes;
    } on Object {
      // The per-source queue excludes newer writers while rollback removes
      // this attempt's rows. Other resource sources have distinct entity keys.
      await _entityBox.deleteAll({...previous, ...next.keys});
      await _entityBox.delete(sourceIndexKey);
      _entityBytes = _countReplicaBytes();
      rethrow;
    }
  }

  Future<void> _removeReplicaSource(String sourceKey) =>
      _serializeReplicaSource(
        sourceKey,
        () => _removeReplicaSourceUnlocked(sourceKey),
      );

  Future<void> _removeReplicaSourceUnlocked(String sourceKey) async {
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
    Set<String>? sourceKeys,
    String? pendingFeature,
    String? pendingPathContains,
    int? limit,
  }) async {
    await init();
    await _replicaMigration;
    final byId = <String, ReplicaEntityRecord>{};
    for (final raw in _entityBox.values) {
      if (raw is! Map ||
          raw['id'] is! String ||
          raw['namespace'] != namespace ||
          raw['userId'] != userId ||
          raw['workspaceId'] != workspaceId ||
          (sourceKeys != null && !sourceKeys.contains(raw['sourceKey']))) {
        continue;
      }
      final row = ReplicaEntityRecord.fromJson(raw);
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
    _refreshTasks.clear();
    _resourceBytes = 0;
    _entityBytes = 0;
    _initialized = false;
    _initialization = null;
    _replicaMigration = null;
  }
}
