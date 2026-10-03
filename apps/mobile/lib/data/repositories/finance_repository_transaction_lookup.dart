part of 'finance_repository.dart';

extension FinanceRepositoryTransactionLookup on FinanceRepository {
  Future<Transaction?> getTransactionById({
    required String wsId,
    required String transactionId,
  }) async {
    final userId = _cacheUserId();
    final local = await _localTransactions(wsId);
    final pending = await _mutationQueue.listPending();
    if (!await _networkAvailable() ||
        pending.any(
          (row) =>
              row.feature == 'finance' &&
              row.workspaceId == wsId &&
              row.entityId == transactionId &&
              (row.path == FinanceEndpoints.transactions(wsId) ||
                  row.path ==
                      FinanceEndpoints.transaction(wsId, transactionId) ||
                  row.path == FinanceEndpoints.transfers(wsId)),
        )) {
      return local.where((row) => row.id == transactionId).firstOrNull;
    }
    try {
      final response = await readThroughJson(
        api: _api,
        namespace: 'finance.transactionDetail',
        workspaceId: wsId,
        path: FinanceEndpoints.transaction(wsId, transactionId),
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
        forceRefresh: true,
      );
      return Transaction.fromJson(response);
    } on Object catch (error) {
      if (error is ApiException && error.statusCode == 404) {
        await _cacheStore.remove(
          CacheKey(
            namespace: 'finance.transactionDetail',
            userId: userId,
            workspaceId: wsId,
            params: {'path': FinanceEndpoints.transaction(wsId, transactionId)},
          ),
        );
        return null;
      }
      if (!isOfflineTransportFailure(error)) rethrow;
      return local.where((row) => row.id == transactionId).firstOrNull;
    }
  }
}
