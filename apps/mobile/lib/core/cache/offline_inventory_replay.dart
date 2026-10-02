part of 'offline_mutation_queue.dart';

extension OfflineInventoryReplay on OfflineMutationQueue {
  /// Persist the operation before any HTTP request, including online creates.
  /// Returns the authoritative resource after durable acknowledgment.
  Future<Map<String, dynamic>?> performInventoryMutation({
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    required String entityId,
    Map<String, dynamic>? payload,
    bool replaySafe = false,
    ApiClient? apiClient,
  }) async {
    final owner = _userId();
    if (owner == null) {
      throw const ApiException(
        message: 'Authentication required',
        statusCode: 401,
      );
    }
    apiClient?.checkUser(owner);
    final record = PendingMutationRecord(
      id: newLocalMutationId(),
      feature: feature,
      method: method,
      path: path,
      createdAt: DateTime.now().toUtc(),
      userId: owner,
      workspaceId: workspaceId,
      payload: payload,
      optimisticPatch: {'entityId': entityId},
      replaySafe: replaySafe,
    );
    final mutation = OfflineInventoryMutation.fromRecord(record);
    if (mutation == null) {
      throw const FormatException('Unsupported inventory mutation');
    }
    _foregroundInventoryResults[record.id] = null;
    if (apiClient != null) _foregroundInventoryClients[record.id] = apiClient;
    try {
      await enqueue(record);
      await synchronize();
      if (_userId() != owner) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
      final remaining = (await _store.listPendingMutations())
          .where((item) => item.id == record.id)
          .firstOrNull;
      final observedError = _foregroundInventoryErrors[record.id];
      if (observedError is ApiException &&
          (observedError.statusCode == 401 ||
              observedError.isVerificationRequired)) {
        throw observedError;
      }
      if (remaining != null &&
          remaining.status != PendingMutationStatus.queued) {
        if (observedError != null) throw observedError;
        throw ApiException(
          message: 'Inventory mutation requires review',
          statusCode: remaining.status == PendingMutationStatus.conflict
              ? 409
              : 400,
        );
      }
      final identity = mutation.isCreate ? mutation.identity : null;
      final data = identity == null
          ? null
          : await _store.localResourceAcknowledgment(identity);
      if (_userId() != owner) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
      return data ?? _foregroundInventoryResults[record.id];
    } finally {
      _foregroundInventoryResults.remove(record.id);
      _foregroundInventoryErrors.remove(record.id);
      _foregroundInventoryClients.remove(record.id);
    }
  }

  Future<void> _registerInventoryProvenance(
    PendingMutationRecord record,
  ) async {
    final mutation = OfflineInventoryMutation.fromRecord(record);
    if (mutation?.isCreate == true && mutation?.identity != null) {
      await _store.registerLocalResource(mutation!.identity!);
    }
  }

  Future<void> _pinInventoryDependencies(
    List<PendingMutationRecord> records,
  ) async {
    final producers = <OfflineResourceReference>{};
    final origins = <OfflineResourceReference>{};
    final scopes = <(String, String)>{};
    for (final record in records) {
      final mutation = OfflineInventoryMutation.fromRecord(record);
      if (mutation == null) continue;
      if (mutation.isCreate && mutation.identity != null) {
        producers.add(mutation.identity!);
        await _store.registerLocalResource(mutation.identity!);
      }
      scopes.add((record.userId!, record.workspaceId!));
    }
    for (final scope in scopes) {
      origins.addAll(
        await _store.localResourceOrigins(
          userId: scope.$1,
          workspaceId: scope.$2,
        ),
      );
    }
    for (final record in records) {
      if (_cancelingIds.contains(record.id)) continue;
      final mutation = OfflineInventoryMutation.fromRecord(record);
      if (mutation == null) continue;
      Set<OfflineResourceReference> references;
      try {
        references = mutation.references;
      } on Object {
        await _store.updatePendingMutation(
          record.id,
          (current) => current.copyWith(
            status: PendingMutationStatus.failed,
            dependencyIssue: OfflineDependencyIssue.invalidPayload,
            lastError: 'Invalid retained inventory payload',
          ),
        );
        continue;
      }
      final known = references.intersection({...producers, ...origins});
      if (known.difference(record.requiredReferences).isNotEmpty) {
        await _store.updatePendingMutation(
          record.id,
          (current) => current.copyWith(
            requiredReferences: {...current.requiredReferences, ...known},
          ),
        );
      }
    }
  }

  /// Scoped dispatchers persist acknowledgment before publishing the mapping.
  Future<void> acknowledgeInventoryCreate(
    PendingMutationRecord record,
    String serverId, {
    Map<String, dynamic>? data,
  }) async {
    if (record.userId != _userId()) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
    final persistence = OfflineInventoryPersistence(_store);
    final acknowledged = await persistence.acknowledge(
      record,
      serverId,
      data: data,
    );
    if (record.userId != _userId()) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
    await persistence.publishAcknowledgment(acknowledged);
  }

  Future<void> _dispatchInventoryHttp(
    PendingMutationRecord record,
    ApiClient api,
  ) async {
    final mutation = OfflineInventoryMutation.fromRecord(record)!;
    final persistence = OfflineInventoryPersistence(_store);
    if (record.acknowledgedWrite) return;
    if (record.acknowledgedServerId != null) {
      await persistence.publishAcknowledgment(record);
      return;
    }
    if (record.acknowledgedDeletedId != null) {
      await persistence.publishDeletion(record);
      return;
    }
    final mappings = await persistence.mappings(mutation.references);
    api.checkUser(record.userId!);
    final resolved = mutation.resolve(mappings);
    Map<String, dynamic>? response;
    switch (record.method.toUpperCase()) {
      case 'POST':
        response = mutation.usesCreateContract
            ? await sendOfflineInventoryCreate(
                api: api,
                workspaceId: record.workspaceId!,
                operationId: record.entityId!,
                kind: mutation.resource,
                payload: resolved.payload ?? {},
              )
            : await api.postJson(resolved.path, resolved.payload);
      case 'PUT':
        response = await api.putJson(resolved.path, resolved.payload ?? {});
      case 'PATCH':
        response = await api.patchJson(resolved.path, resolved.payload ?? {});
      case 'DELETE':
        await api.deleteJson(resolved.path, body: resolved.payload);
        api.checkUser(record.userId!);
        final identity = mutation.identity!;
        final acknowledged = await persistence.acknowledgeDeletion(
          record,
          mappings[identity] ?? identity.localId,
        );
        await persistence.publishDeletion(acknowledged);
      default:
        throw const FormatException('Unsupported retained inventory method');
    }
    api.checkUser(record.userId!);
    if (mutation.isCreate) {
      final id = response == null
          ? null
          : createdServerId(response) ??
                (mutation.resource == 'wallet' &&
                        record.payload?['id'] == record.entityId
                    ? record.entityId
                    : null);
      if (id == null) {
        throw const ApiException(
          message: 'Created inventory ID is unavailable',
          statusCode: 503,
          code: 'OFFLINE_CONTRACT_UNAVAILABLE',
        );
      }
      final resourceData = response?['data'];
      await acknowledgeInventoryCreate(
        record,
        id,
        data: resourceData is Map
            ? Map<String, dynamic>.from(resourceData)
            : {...?response, 'id': id},
      );
    } else if (record.method.toUpperCase() != 'DELETE') {
      final data = response?['data'];
      await _store.updatePendingMutation(
        record.id,
        (current) => current.copyWith(
          acknowledgedWrite: true,
          acknowledgedData: data is Map
              ? Map<String, dynamic>.from(data)
              : response,
        ),
      );
    }
  }

  /// Returns true for global authentication/transport/cooldown interruption.
  Future<bool> _drainInventoryDependencies(
    List<PendingMutationRecord> source,
  ) async {
    if (source.isEmpty) return false;
    final attempted = <String>{};
    final persistence = OfflineInventoryPersistence(_store);
    while (true) {
      final records = (await listPending())
          .where(
            (record) => OfflineInventoryMutation.fromRecord(record) != null,
          )
          .toList();
      await _pinInventoryDependencies(records);
      final current = (await listPending())
          .where(
            (record) => OfflineInventoryMutation.fromRecord(record) != null,
          )
          .toList();
      final nodes = <OfflineDependencyNode>[];
      for (final record in current) {
        final mutation = OfflineInventoryMutation.fromRecord(record)!;
        try {
          nodes.add(mutation.node);
        } on Object {
          nodes.add(
            OfflineDependencyNode(
              record: record.copyWith(status: PendingMutationStatus.failed),
              produces: mutation.isCreate ? mutation.identity : null,
              serialIdentity: mutation.identity,
              requiredReferences: record.requiredReferences,
            ),
          );
        }
      }
      final graph = OfflineDependencyGraph(nodes);
      final references = nodes
          .expand(
            (node) => {
              ...node.references,
              ...node.requiredReferences,
              if (node.produces != null) node.produces!,
            },
          )
          .toSet();
      final mappings = await persistence.mappings(references);
      final ready = graph.ready(
        acknowledged: {},
        mapped: mappings.keys.toSet(),
      );
      // A committed acknowledgment needs no further server requests/dependencies.
      final candidates = [
        ...nodes.where(
          (node) =>
              (node.record.acknowledgedServerId != null ||
                  node.record.acknowledgedDeletedId != null ||
                  node.record.acknowledgedWrite) &&
              node.record.status == PendingMutationStatus.queued,
        ),
        ...ready,
      ];
      final next = candidates
          .where(
            (node) =>
                !attempted.contains(node.record.id) &&
                !_cancelingIds.contains(node.record.id) &&
                !(OfflineInventoryMutation.fromRecord(
                      node.record,
                    )!.usesCreateContract &&
                    node.record.acknowledgedServerId == null &&
                    _contractUnavailableUntil != null &&
                    DateTime.now().isBefore(_contractUnavailableUntil!)),
          )
          .firstOrNull;
      if (next == null) {
        final producers = nodes
            .map((node) => node.produces)
            .whereType<OfflineResourceReference>()
            .toSet();
        for (final node in nodes.where(
          (node) =>
              node.record.status == PendingMutationStatus.queued &&
              !attempted.contains(node.record.id) &&
              !ready.contains(node),
        )) {
          final id = node.record.id;
          final missing = (graph.requiredByRecord[id] ?? {}).any(
            (ref) => !mappings.containsKey(ref) && !producers.contains(ref),
          );
          final issue = graph.cycles.contains(id)
              ? OfflineDependencyIssue.cycle
              : graph.ambiguous.contains(id)
              ? OfflineDependencyIssue.ambiguous
              : missing
              ? OfflineDependencyIssue.missing
              : OfflineDependencyIssue.waiting;
          if (node.record.dependencyIssue != issue) {
            await _store.updatePendingMutation(
              id,
              (current) => current.copyWith(dependencyIssue: issue),
            );
          }
        }
        return false;
      }
      final record = next.record;
      if (record.userId == null || record.userId != _userId()) return true;
      attempted.add(record.id);
      syncingIds.value = {...syncingIds.value, record.id};
      try {
        if (record.acknowledgedWrite) {
          // Server response is already durable; no second HTTP write.
        } else if (record.acknowledgedServerId != null) {
          await persistence.publishAcknowledgment(record);
        } else if (record.acknowledgedDeletedId != null) {
          await persistence.publishDeletion(record);
        } else {
          final dispatcher = _dispatchers[record.feature] ?? _dispatchers['*'];
          if (dispatcher == null) continue;
          await dispatcher(record);
        }
        if (record.userId != _userId()) return true;
        final latest = (await listPending())
            .where((item) => item.id == record.id)
            .firstOrNull;
        if (next.produces != null && latest?.acknowledgedServerId == null) {
          throw const ApiException(
            message: 'Created inventory acknowledgment is unavailable',
            statusCode: 503,
            code: 'OFFLINE_CONTRACT_UNAVAILABLE',
          );
        }
        if (latest?.acknowledgedServerId != null) {
          await persistence.publishAcknowledgment(latest!);
        }
        if (latest?.acknowledgedDeletedId != null) {
          await persistence.publishDeletion(latest!);
        }
        if (_foregroundInventoryResults.containsKey(record.id)) {
          _foregroundInventoryResults[record.id] = latest?.acknowledgedData;
        }
        await _store.deletePendingMutation(record.id);
        try {
          await _store.invalidateTags(
            {'module:${record.feature}'},
            userId: record.userId,
            workspaceId: record.workspaceId,
          );
        } on Object {
          /* A local invalidation failure cannot resend an acknowledgment. */
        }
      } on Exception catch (error) {
        if (_foregroundInventoryResults.containsKey(record.id)) {
          _foregroundInventoryErrors[record.id] = error;
        }
        final latest = (await _store.listPendingMutations())
            .where((item) => item.id == record.id)
            .firstOrNull;
        if (latest == null) continue;
        final unavailable =
            error is ApiException &&
            error.code == 'OFFLINE_CONTRACT_UNAVAILABLE';
        final safe =
            record.replaySafe ||
            OfflineInventoryMutation.fromRecord(record)!.usesCreateContract ||
            latest.acknowledgedServerId != null ||
            latest.acknowledgedDeletedId != null ||
            latest.acknowledgedWrite;
        final status = switch (error) {
          ApiException(statusCode: 409 || 412) =>
            PendingMutationStatus.conflict,
          ApiException(statusCode: 401 || 429) => PendingMutationStatus.queued,
          ApiException(isVerificationRequired: true) =>
            PendingMutationStatus.queued,
          ApiException(statusCode: 403) => PendingMutationStatus.failed,
          _
              when unavailable ||
                  _isRetryable(error) && safe ||
                  (latest.acknowledgedServerId != null ||
                      latest.acknowledgedDeletedId != null ||
                      latest.acknowledgedWrite) =>
            PendingMutationStatus.queued,
          _ when _isRetryable(error) => PendingMutationStatus.conflict,
          _ => PendingMutationStatus.failed,
        };
        final changed = await _store.updatePendingMutation(
          record.id,
          (current) => current.copyWith(
            attemptCount: current.attemptCount + 1,
            status: status,
            lastError: error.toString(),
            dependencyIssue: unavailable
                ? OfflineDependencyIssue.contractUnavailable
                : null,
            clearDependencyIssue: !unavailable,
          ),
        );
        if (status == PendingMutationStatus.queued &&
            changed != null &&
            !(error is ApiException &&
                (error.statusCode == 401 || error.isVerificationRequired))) {
          final seconds = error is ApiException && error.statusCode == 429
              ? max(60, error.retryAfter ?? 60)
              : min(120, 1 << changed.attemptCount.clamp(1, 6));
          if (unavailable) {
            _contractUnavailableUntil = DateTime.now().add(
              Duration(seconds: seconds),
            );
          }
          if (error is ApiException && error.statusCode == 429) {
            _serverCooldownUntil = DateTime.now().add(
              Duration(seconds: seconds),
            );
          }
          _retryTimer?.cancel();
          _retryTimer = Timer(Duration(seconds: seconds), _scheduleSync);
        }
        if (error is ApiException &&
            (error.statusCode == 0 ||
                error.statusCode == 401 ||
                error.statusCode == 429 ||
                error.isVerificationRequired)) {
          return true;
        }
      } finally {
        syncingIds.value = {...syncingIds.value}..remove(record.id);
      }
    }
  }
}
