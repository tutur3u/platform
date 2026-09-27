part of 'finance_repository.dart';

extension FinanceRepositoryCheckpoints on FinanceRepository {
  // ── Wallet checkpoints ─────────────────────────

  static const _checkpointPolicy = CachePolicy(
    staleAfter: Duration(minutes: 2),
    expireAfter: Duration(days: 365),
  );

  CacheKey _checkpointKey(String wsId, {String? walletId, int? limit}) =>
      CacheKey(
        namespace: walletId == null
            ? 'finance.checkpointSummary'
            : 'finance.checkpointList',
        userId: currentCacheUserId(),
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
    final cached = await CacheStore.instance.prefetch<T>(
      key: key,
      policy: _checkpointPolicy,
      tags: ['finance:checkpoints', 'workspace:${key.workspaceId}'],
      decode: (json) => decode(Map<String, dynamic>.from(json! as Map)),
      fetch: fetch,
      forceRefresh: forceRefresh,
    );
    if (cached.data == null) {
      throw StateError('Wallet checkpoints are unavailable.');
    }
    return cached.data as T;
  }

  Future<void> _invalidateCheckpoints(String wsId) => CacheStore.instance
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
    final query = Uri(queryParameters: {'limit': limit.toString()}).query;
    return await _cachedCheckpoints(
      _checkpointKey(wsId, walletId: walletId, limit: limit),
      () => _api.getJson(
        '${FinanceEndpoints.walletCheckpoints(wsId, walletId)}?$query',
      ),
      WalletCheckpointListResponse.fromJson,
      forceRefresh: forceRefresh,
    );
  }

  Future<WalletCheckpoint> createWalletCheckpoint({
    required String wsId,
    required String walletId,
    required double actualBalance,
    required DateTime checkedAt,
    String? note,
  }) async {
    final response = await _api
        .postJson(FinanceEndpoints.walletCheckpoints(wsId, walletId), {
          'actual_balance': actualBalance,
          'checked_at': checkedAt.toIso8601String(),
          'note': note,
        });
    await _invalidateCheckpoints(wsId);
    return WalletCheckpoint.fromJson(response);
  }

  Future<WalletCheckpointBatchResponse> createWalletCheckpointBatch({
    required String wsId,
    required DateTime checkedAt,
    required List<WalletCheckpointBatchEntry> entries,
  }) async {
    final response = await _api
        .postJson(FinanceEndpoints.walletCheckpointSummary(wsId), {
          'checked_at': checkedAt.toIso8601String(),
          'entries': entries.map((entry) => entry.toJson()).toList(),
        });
    await _invalidateCheckpoints(wsId);
    return WalletCheckpointBatchResponse.fromJson(response);
  }

  Future<WalletCheckpoint> updateWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
    required double actualBalance,
    required DateTime checkedAt,
    String? note,
  }) async {
    final response = await _api.patchJson(
      FinanceEndpoints.walletCheckpoint(wsId, walletId, checkpointId),
      {
        'actual_balance': actualBalance,
        'checked_at': checkedAt.toIso8601String(),
        'note': note,
      },
    );
    await _invalidateCheckpoints(wsId);
    return WalletCheckpoint.fromJson(response);
  }

  Future<void> deleteWalletCheckpoint({
    required String wsId,
    required String walletId,
    required String checkpointId,
  }) async {
    await _api.deleteJson(
      FinanceEndpoints.walletCheckpoint(wsId, walletId, checkpointId),
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
    final response = await _api.postJson(
      FinanceEndpoints.walletCheckpointReconciliation(
        wsId,
        walletId,
        checkpointId,
      ),
      {'basis': basis, 'category_id': categoryId, 'description': description},
    );
    await _invalidateCheckpoints(wsId);
    return WalletCheckpointReconciliationResponse.fromJson(response);
  }
}
