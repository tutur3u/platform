part of 'finance_repository.dart';

mixin FinanceRepositoryRecurring {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;

  String _recurringPath(String workspace, [String? id]) {
    final root =
        '/api/v1/workspaces/${Uri.encodeComponent(workspace)}'
        '/finance/recurring-transactions';
    return id == null ? root : '$root/${Uri.encodeComponent(id)}';
  }

  Future<List<RecurringTransaction>> getRecurringTransactions(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final result = await readThroughJson(
      api: _api,
      namespace: 'finance.recurring',
      workspaceId: wsId,
      path: _recurringPath(wsId),
      forceRefresh: forceRefresh,
      cacheStore: _cacheStore,
      cacheUserId: _cacheUserId,
    );
    return (result['recurringTransactions'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>()
        .map(RecurringTransaction.fromJson)
        .toList(growable: false);
  }

  Future<void> saveRecurringTransaction({
    required String workspace,
    required RecurringTransactionDraft draft,
    String? id,
  }) async {
    final userId = _cacheUserId();
    final path = _recurringPath(workspace, id);
    final payload = RecurringTransaction.payload(draft);
    Future<Map<String, dynamic>> send() =>
        id == null ? _api.postJson(path, payload) : _api.putJson(path, payload);
    if (userId == null) {
      await send();
    } else {
      await ApiClient.runForUser(userId, send);
    }
    await _invalidateRecurring(workspace, userId);
  }

  Future<void> deleteRecurringTransaction({
    required String workspace,
    required String id,
  }) async {
    final userId = _cacheUserId();
    Future<Map<String, dynamic>> send() =>
        _api.deleteJson(_recurringPath(workspace, id));
    if (userId == null) {
      await send();
    } else {
      await ApiClient.runForUser(userId, send);
    }
    await _invalidateRecurring(workspace, userId);
  }

  Future<void> _invalidateRecurring(String workspace, String? userId) async {
    if (userId != null) {
      await _cacheStore.remove(
        CacheKey(
          namespace: 'finance.recurring',
          userId: userId,
          workspaceId: workspace,
          params: {'path': _recurringPath(workspace)},
        ),
      );
    }
  }
}
