part of 'finance_repository.dart';

extension FinanceOfflinePreparation on FinanceRepository {
  Future<void> prepareOffline(String wsId) async {
    final user = _cacheUserId();
    if (user == null) throw StateError('Sign in to download finance.');
    final manifest = OfflineDownloadManifest(_cacheStore, user, _cacheUserId);
    Future<Object> download(
      String namespace,
      String path, {
      bool list = false,
    }) async {
      manifest.checkScope();
      final response = list
          ? await _api.getJsonList(path)
          : await _api.getJson(path);
      await manifest.save(
        CacheKey(
          namespace: 'finance.$namespace',
          userId: user,
          workspaceId: wsId,
          params: {'path': path},
        ),
        response,
      );
      return response;
    }

    final rateManifest = OfflineDownloadManifest(
      _cacheStore,
      user,
      _cacheUserId,
    );
    manifest.checkScope();
    final rates = await _api.getJson(FinanceEndpoints.exchangeRates);
    await rateManifest.save(
      CacheKey(
        namespace: 'finance.exchangeRates',
        userId: user,
        workspaceId: 'global',
        params: {'path': FinanceEndpoints.exchangeRates},
      ),
      rates,
    );
    final summary = await _api.getJson(
      FinanceEndpoints.walletCheckpointSummary(wsId),
    );
    await manifest.save(_checkpointKey(wsId), summary);
    final currency = await _fetchWorkspaceDefaultCurrencyRemote(wsId);
    await manifest.save(_workspaceCurrencyCacheKey(wsId), currency);
    FinanceRepository._workspaceCurrencyCache[_workspaceCurrencyMemoryKey(
      wsId,
    )] = _WorkspaceCurrencyCacheEntry(
      currency: currency,
      fetchedAt: DateTime.now(),
    );
    final wallets =
        await download('wallets', FinanceEndpoints.wallets(wsId), list: true)
            as List<dynamic>;
    await download('categories', FinanceEndpoints.categories(wsId), list: true);
    await download('tags', FinanceEndpoints.tags(wsId), list: true);
    await download('transactionStats', FinanceEndpoints.transactionStats(wsId));
    for (final wallet in wallets.whereType<Map<String, dynamic>>()) {
      final id = wallet['id'] as String;
      final statsQuery = Uri(queryParameters: {'walletId': id}).query;
      await download(
        'transactionStats',
        '${FinanceEndpoints.transactionStats(wsId)}?$statsQuery',
      );
      await download('walletDetail', FinanceEndpoints.wallet(wsId, id));
      final checkpoints = await _api.getJson(
        '${FinanceEndpoints.walletCheckpoints(wsId, id)}?limit=50',
      );
      await manifest.save(
        _checkpointKey(wsId, walletId: id, limit: 50),
        checkpoints,
      );
    }
    String? cursor;
    final seen = <String>{};
    for (var page = 0; page < 1000; page++) {
      final query = Uri(
        queryParameters: {'limit': '100', if (cursor != null) 'cursor': cursor},
      ).query;
      final path = '${FinanceEndpoints.infiniteTransactions(wsId)}?$query';
      final response =
          await download('infiniteTransactions', path) as Map<String, dynamic>;
      final transactions = InfiniteTransactionResponse.fromJson(response);
      for (final transaction in transactions.data) {
        await download(
          'transactionDetail',
          FinanceEndpoints.transaction(wsId, transaction.id),
        );
      }
      if (!transactions.hasMore) {
        await manifest.verify();
        await rateManifest.verify();
        await manifest.reconcile(
          workspaceId: wsId,
          namespaces: {
            'finance.infiniteTransactions',
            'finance.transactionDetail',
            'finance.walletDetail',
          },
        );
        manifest.retain('finance', wsId);
        rateManifest.retain('finance-rates', wsId);
        return;
      }
      cursor = transactions.nextCursor;
      if (cursor == null || !seen.add(cursor)) {
        throw StateError('Finance download cursor did not advance.');
      }
    }
    throw StateError('Finance download pagination limit reached.');
  }
}
