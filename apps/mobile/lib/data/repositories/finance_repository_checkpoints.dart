part of 'finance_repository.dart';

mixin FinanceRepositoryCheckpoints {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;
  OfflineMutationQueue get _mutationQueue;

  static const _checkpointPolicy = CachePolicy(
    staleAfter: Duration(minutes: 2),
    expireAfter: Duration(days: 365),
  );

  CacheKey _checkpointKey(String wsId, {String? walletId, int? limit}) =>
      CacheKey(
        namespace: walletId == null
            ? 'finance.checkpointSummary'
            : 'finance.checkpointList',
        userId: _cacheUserId(),
        workspaceId: wsId,
        params: {
          if (walletId != null) 'walletId': walletId,
          if (limit != null) 'limit': '$limit',
        },
      );

  Future<T> _cachedCheckpoints<T>(
    CacheKey key,
    Future<Map<String, dynamic>> Function() fetch,
    T Function(Map<String, dynamic>) decode, {
    bool forceRefresh = false,
  }) async {
    T decodePayload(Object? json) =>
        decode(Map<String, dynamic>.from(json! as Map));
    final userId = key.userId;
    void checkScope() {
      if (_cacheUserId() != userId) {
        throw const ApiException(
          message: 'Account changed during checkpoint read',
          statusCode: 401,
        );
      }
    }

    CacheReadResult<T> cached;
    try {
      cached = await _cacheStore.prefetch<T>(
        key: key,
        policy: _checkpointPolicy,
        tags: [
          'module:finance',
          'finance:checkpoints',
          'workspace:${key.workspaceId}',
        ],
        decode: decodePayload,
        checkScope: checkScope,
        fetch: () async {
          try {
            checkScope();
            final data = userId == null
                ? await fetch()
                : await ApiClient.runForUser(userId, fetch);
            checkScope();
            return data;
          } on ApiException catch (error) {
            if (error.statusCode == 401 ||
                (error.statusCode == 403 && !error.isVerificationRequired)) {
              await _cacheStore.remove(key);
            }
            rethrow;
          }
        },
        forceRefresh: forceRefresh,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      cached = await _cacheStore.read<T>(key: key, decode: decodePayload);
      if (!cached.hasValue) rethrow;
    }
    checkScope();
    if (cached.data == null) {
      throw StateError('Wallet checkpoints are unavailable.');
    }
    return cached.data as T;
  }

  Future<void> _invalidateCheckpoints(String wsId) => _cacheStore
      .invalidateTags(const ['finance:checkpoints'], workspaceId: wsId);

  Future<WalletCheckpointSummaryResponse> getWalletCheckpointSummary({
    required String wsId,
    bool forceRefresh = false,
  }) async {
    return await _cachedCheckpoints(
      _checkpointKey(wsId),
      () => _api.getJson(FinanceEndpoints.walletCheckpointSummary(wsId)),
      WalletCheckpointSummaryResponse.fromJson,
      forceRefresh: forceRefresh,
    );
  }

  Future<WalletCheckpointListResponse> getWalletCheckpoints({
    required String wsId,
    required String walletId,
    int limit = 50,
    bool forceRefresh = false,
  }) async {
    final userId = _cacheUserId();
    final query = Uri(queryParameters: {'limit': limit.toString()}).query;
    WalletCheckpointListResponse confirmed;
    try {
      confirmed = await _cachedCheckpoints(
        _checkpointKey(wsId, walletId: walletId, limit: limit),
        () => _api.getJson(
          '${FinanceEndpoints.walletCheckpoints(wsId, walletId)}?$query',
        ),
        WalletCheckpointListResponse.fromJson,
        forceRefresh: forceRefresh,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      confirmed = const WalletCheckpointListResponse(data: [], intervals: []);
    }
    return _overlayPendingCheckpoints(
      wsId,
      walletId,
      confirmed,
      _mutationQueue.pending.value.where((edit) => edit.userId == userId),
    );
  }

  Future<WalletCheckpoint> createWalletCheckpoint({
    required String wsId,
    required String walletId,
    required double actualBalance,
    required DateTime checkedAt,
    String? note,
  }) async {
    final path = FinanceEndpoints.walletCheckpoints(wsId, walletId);
    final payload = {
      'actual_balance': actualBalance,
      'checked_at': checkedAt.toUtc().toIso8601String(),
      'note': note,
    };
    final checkpoint = await queueOrSendValue<WalletCheckpoint>(
      queue: _mutationQueue,
      apiClient: _api,
      expectedUserId: _cacheUserId(),
      feature: 'finance',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => _pendingCheckpoint(
        id: id,
        walletId: walletId,
        actualBalance: actualBalance,
        checkedAt: checkedAt,
        note: note,
      ),
      send: () async =>
          WalletCheckpoint.fromJson(await _api.postJson(path, payload)),
    );
    await _invalidateCheckpoints(wsId);
    return checkpoint;
  }

  Future<WalletCheckpointBatchResponse> createWalletCheckpointBatch({
    required String wsId,
    required DateTime checkedAt,
    required List<WalletCheckpointBatchEntry> entries,
  }) async {
    final path = FinanceEndpoints.walletCheckpointSummary(wsId);
    final payload = {
      'checked_at': checkedAt.toUtc().toIso8601String(),
      'entries': entries.map((entry) => entry.toJson()).toList(),
    };
    final batch = await queueOrSendValue<WalletCheckpointBatchResponse>(
      queue: _mutationQueue,
      apiClient: _api,
      expectedUserId: _cacheUserId(),
      feature: 'finance',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (_) =>
          const WalletCheckpointBatchResponse(data: [], totalsByCurrency: []),
      send: () async => WalletCheckpointBatchResponse.fromJson(
        await _api.postJson(path, payload),
      ),
    );
    await _invalidateCheckpoints(wsId);
    return batch;
  }

  Future<WalletCheckpoint> updateWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
    required double actualBalance,
    required DateTime checkedAt,
    String? note,
  }) async {
    final path = FinanceEndpoints.walletCheckpoint(
      wsId,
      walletId,
      checkpointId,
    );
    final payload = {
      'actual_balance': actualBalance,
      'checked_at': checkedAt.toUtc().toIso8601String(),
      'note': note,
    };
    final checkpoint = await queueOrSendValue<WalletCheckpoint>(
      queue: _mutationQueue,
      apiClient: _api,
      expectedUserId: _cacheUserId(),
      feature: 'finance',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: checkpointId,
      payload: payload,
      pendingValue: (_) => _pendingCheckpoint(
        id: checkpointId,
        walletId: walletId,
        actualBalance: actualBalance,
        checkedAt: checkedAt,
        note: note,
      ),
      send: () async =>
          WalletCheckpoint.fromJson(await _api.patchJson(path, payload)),
    );
    await _invalidateCheckpoints(wsId);
    return checkpoint;
  }

  Future<void> setWalletCheckpointReview({
    required String wsId,
    required WalletCheckpoint checkpoint,
    required bool reviewed,
    required bool Function() active,
  }) async {
    final actor = _cacheUserId();
    if (actor == null || !active()) return;
    final workspace = Uri.encodeComponent(wsId);
    final wallet = Uri.encodeComponent(checkpoint.walletId);
    final id = Uri.encodeComponent(checkpoint.id);
    final path =
        '/api/v1/workspaces/$workspace/finance/wallets/$wallet'
        '/checkpoints/$id/review';
    await _api.putJsonOperationAcknowledged(
      path,
      {
        'reviewed': reviewed,
        'expected_updated_at': checkpoint.updatedAt.toUtc().toIso8601String(),
      },
      admission: ApiMutationAdmission(
        actorId: actor,
        isCurrent: () => active() && _cacheUserId() == actor,
      ),
      onAcknowledged: (_) => _cacheStore.invalidateTags(
        const ['finance:checkpoints'],
        workspaceId: wsId,
        userId: actor,
      ),
    );
  }

  Future<void> deleteWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
  }) async {
    final path = FinanceEndpoints.walletCheckpoint(
      wsId,
      walletId,
      checkpointId,
    );
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      expectedUserId: _cacheUserId(),
      feature: 'finance',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: checkpointId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidateCheckpoints(wsId);
  }

  Future<WalletCheckpointReconciliationResponse> reconcileWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
    required String basis,
    String? categoryId,
    String? description,
  }) async {
    final path = FinanceEndpoints.walletCheckpointReconciliation(
      wsId,
      walletId,
      checkpointId,
    );
    final payload = {
      'basis': basis,
      'category_id': categoryId,
      'description': description,
    };
    final response =
        await queueOrSendValue<WalletCheckpointReconciliationResponse>(
          queue: _mutationQueue,
          apiClient: _api,
          expectedUserId: _cacheUserId(),
          feature: 'finance',
          method: 'POST',
          path: path,
          workspaceId: wsId,
          entityId: checkpointId,
          payload: payload,
          pendingValue: (_) => WalletCheckpointReconciliationResponse(
            checkedAt: DateTime.now(),
            checkpointId: checkpointId,
            created: false,
            offsetAmount: 0,
            walletId: walletId,
          ),
          send: () async => WalletCheckpointReconciliationResponse.fromJson(
            await _api.postJson(path, payload),
          ),
        );
    await _invalidateCheckpoints(wsId);
    return response;
  }
}

WalletCheckpoint _pendingCheckpoint({
  required String id,
  required String walletId,
  required double actualBalance,
  required DateTime checkedAt,
  String? note,
}) => WalletCheckpoint(
  id: id,
  walletId: walletId,
  actualBalance: actualBalance,
  ledgerBalance: 0,
  currentLedgerBalance: 0,
  originalVariance: 0,
  currentVariance: 0,
  currency: 'USD',
  checkedAt: checkedAt,
  createdAt: DateTime.now(),
  updatedAt: DateTime.now(),
  note: note,
);

WalletCheckpointListResponse _overlayPendingCheckpoints(
  String wsId,
  String walletId,
  WalletCheckpointListResponse confirmed,
  Iterable<PendingMutationRecord> pending,
) {
  final rows = {for (final row in confirmed.data) row.id: row};
  final collectionPath = FinanceEndpoints.walletCheckpoints(wsId, walletId);
  for (final edit in pending) {
    if (edit.feature != 'finance' || edit.workspaceId != wsId) continue;
    final id = edit.entityId;
    final payload = edit.payload;
    if (id == null) continue;
    if (edit.method == 'DELETE' &&
        edit.path == FinanceEndpoints.walletCheckpoint(wsId, walletId, id)) {
      rows.remove(id);
      continue;
    }
    if (payload == null) continue;
    final isCreate = edit.method == 'POST' && edit.path == collectionPath;
    final isBatch =
        edit.method == 'POST' &&
        edit.path == FinanceEndpoints.walletCheckpointSummary(wsId);
    if (isBatch) {
      final entries = payload['entries'] as List<dynamic>? ?? const [];
      for (var index = 0; index < entries.length; index++) {
        final entry = entries[index];
        if (entry is! Map || entry['wallet_id'] != walletId) continue;
        rows[id] = _pendingCheckpoint(
          id: id,
          walletId: walletId,
          actualBalance: (entry['actual_balance'] as num).toDouble(),
          checkedAt:
              DateTime.tryParse(payload['checked_at'] as String? ?? '') ??
              edit.createdAt,
          note: entry['note'] as String?,
        );
      }
      continue;
    }
    final isUpdate =
        edit.method == 'PATCH' &&
        edit.path == FinanceEndpoints.walletCheckpoint(wsId, walletId, id);
    if (isCreate || isUpdate) {
      final previous = rows[id];
      final pending = _pendingCheckpoint(
        id: id,
        walletId: walletId,
        actualBalance: (payload['actual_balance'] as num).toDouble(),
        checkedAt:
            DateTime.tryParse(payload['checked_at'] as String? ?? '') ??
            edit.createdAt,
        note: payload['note'] as String?,
      );
      rows[id] = previous == null
          ? pending
          : WalletCheckpoint(
              id: id,
              walletId: walletId,
              actualBalance: pending.actualBalance,
              ledgerBalance: previous.ledgerBalance,
              currentLedgerBalance: previous.currentLedgerBalance,
              originalVariance: previous.originalVariance,
              currentVariance: previous.currentVariance,
              currency: previous.currency,
              checkedAt: pending.checkedAt,
              createdAt: previous.createdAt,
              updatedAt: edit.createdAt,
              note: pending.note,
            );
    } else if (edit.method == 'DELETE' &&
        edit.path == FinanceEndpoints.walletCheckpoint(wsId, walletId, id)) {
      rows.remove(id);
    }
  }
  return WalletCheckpointListResponse(
    data: rows.values.toList()
      ..sort((a, b) {
        final byCheck = b.checkedAt.compareTo(a.checkedAt);
        return byCheck != 0 ? byCheck : b.createdAt.compareTo(a.createdAt);
      }),
    intervals: confirmed.intervals,
    latest: confirmed.latest,
  );
}
