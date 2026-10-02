part of 'finance_repository.dart';

extension FinanceRepositoryTransactionLookup on FinanceRepository {
  Future<Transaction?> getTransactionById({
    required String wsId,
    required String transactionId,
  }) async {
    final local = await _localTransactions(wsId);
    final pending = await _mutationQueue.listPending();
    if (!await _networkAvailable() ||
        pending.any(
          (row) => row.workspaceId == wsId && row.entityId == transactionId,
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
      );
      return Transaction.fromJson(response);
    } on Object catch (error) {
      if (error is ApiException && error.statusCode == 404) return null;
      if (!isOfflineTransportFailure(error)) rethrow;
      return local.where((row) => row.id == transactionId).firstOrNull;
    }
  }
}
