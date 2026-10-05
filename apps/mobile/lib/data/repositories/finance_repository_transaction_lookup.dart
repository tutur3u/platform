part of 'finance_repository.dart';

extension FinanceRepositoryTransactionLookup on FinanceRepository {
  Future<Transaction?> getTransactionById({
    required String wsId,
    required String transactionId,
  }) async {
    final userId = _cacheUserId();
    void checkActor() {
      if (_cacheUserId() != userId) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
    }

    Future<Transaction?> localDetail() async {
      final local = await _localTransactions(wsId);
      checkActor();
      return local.where((row) => row.id == transactionId).firstOrNull;
    }

    final pending = await _mutationQueue.listPending();
    final online = await _networkAvailable();
    checkActor();
    if (!online ||
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
      return await localDetail();
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
        // Fall back through merged rows so newer server redactions win over an
        // older raw detail snapshot during awaited refresh transport errors.
        allowAwaitedTransportFallback: false,
      );
      return Transaction.fromJson(response);
    } on Object catch (error) {
      checkActor();
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
      return await localDetail();
    }
  }
}
