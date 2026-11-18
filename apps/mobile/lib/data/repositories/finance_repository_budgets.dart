part of 'finance_repository.dart';

/// Budgets read through the offline cache, with queued edits overlaid.
typedef FinanceBudgetList = ({
  List<FinanceBudget> budgets,
  Set<String> pendingIds,
});

mixin FinanceRepositoryBudgets {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;
  OfflineMutationQueue get _mutationQueue;

  Future<FinanceBudgetList> getBudgets(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final userId = _cacheUserId();
    final path = FinanceEndpoints.budgets(wsId);
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'finance.budgets',
      workspaceId: wsId,
      path: path,
      forceRefresh: forceRefresh,
      cacheStore: _cacheStore,
      cacheUserId: _cacheUserId,
    );
    final pending = (await _mutationQueue.listPending())
        .where(
          (record) =>
              record.feature == 'finance' &&
              record.workspaceId == wsId &&
              record.path.contains(path),
        )
        .toList(growable: false);
    if (userId != _cacheUserId()) {
      throw const ApiException(
        message: 'Account changed during budget read',
        statusCode: 401,
      );
    }
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'finance',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: pending,
      normalizeCreate: (payload) => {...payload, 'spent': 0},
    );
    return (
      budgets: rows.map(FinanceBudget.fromJson).toList(growable: false),
      pendingIds: {
        for (final record in pending)
          if (record.entityId != null && record.method != 'DELETE')
            record.entityId!,
      },
    );
  }

  Future<void> createBudget({
    required String wsId,
    required FinanceBudget budget,
  }) async {
    final path = FinanceEndpoints.budgets(wsId);
    final payload = budget.toPayload();
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'finance',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      expectedUserId: _cacheUserId(),
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
        await _invalidateBudgets(wsId);
      },
    );
  }

  Future<void> updateBudget({
    required String wsId,
    required FinanceBudget budget,
  }) async {
    final path = FinanceEndpoints.budget(wsId, budget.id);
    final payload = budget.toPayload();
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'finance',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      expectedUserId: _cacheUserId(),
      payload: payload,
      entityId: budget.id,
      send: () async {
        await _api.patchJson(path, payload);
        await _invalidateBudgets(wsId);
      },
    );
  }

  Future<void> deleteBudget({
    required String wsId,
    required String budgetId,
  }) async {
    final path = FinanceEndpoints.budget(wsId, budgetId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'finance',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      expectedUserId: _cacheUserId(),
      entityId: budgetId,
      send: () async {
        await _api.deleteJson(path);
        await _invalidateBudgets(wsId);
      },
    );
  }

  Future<void> _invalidateBudgets(String wsId) =>
      _cacheStore.invalidateTags(const ['module:finance'], workspaceId: wsId);
}
