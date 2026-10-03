part of 'finance_repository.dart';

extension FinanceOfflinePreparation on FinanceRepository {
  Future<void> prepareOffline(String wsId) async {
    final user = _cacheUserId();
    if (user == null) throw StateError('Sign in to download finance.');
    final manifest = OfflineDownloadManifest(_cacheStore, user, _cacheUserId);
    final staged = <(OfflineDownloadManifest, CacheKey, Object?)>[];
    var stagedBytes = 0;
    void stage(OfflineDownloadManifest target, CacheKey key, Object? payload) {
      target.checkScope();
      stagedBytes += utf8.encode(jsonEncode(payload)).length;
      if (stagedBytes > 32 * 1024 * 1024 || staged.length >= 10000) {
        throw StateError('Finance download exceeds the staging limit.');
      }
      staged.add((target, key, payload));
    }

    Future<Object> download(
      String namespace,
      String path, {
      bool list = false,
    }) async {
      manifest.checkScope();
      final response = list
          ? await ApiClient.runForUser(user, () => _api.getJsonList(path))
          : await ApiClient.runForUser(user, () => _api.getJson(path));
      stage(
        manifest,
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
    final rates = await ApiClient.runForUser(
      user,
      () => _api.getJson(FinanceEndpoints.exchangeRates),
    );
    stage(
      rateManifest,
      CacheKey(
        namespace: 'finance.exchangeRates',
        userId: user,
        workspaceId: 'global',
        params: {'path': FinanceEndpoints.exchangeRates},
      ),
      rates,
    );
    final summary = await ApiClient.runForUser(
      user,
      () => _api.getJson(FinanceEndpoints.walletCheckpointSummary(wsId)),
    );
    stage(manifest, _checkpointKey(wsId), summary);
    final currency = await ApiClient.runForUser(
      user,
      () => _fetchWorkspaceDefaultCurrencyRemote(wsId),
    );
    stage(manifest, _workspaceCurrencyCacheKey(wsId), currency);
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
      final checkpoints = await ApiClient.runForUser(
        user,
        () => _api.getJson(
          '${FinanceEndpoints.walletCheckpoints(wsId, id)}?limit=50',
        ),
      );
      stage(
        manifest,
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
        manifest.checkScope();
        for (final (target, key, payload) in staged) {
          await target.save(key, payload);
        }
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
        FinanceRepository._workspaceCurrencyCache['$user:$wsId'] =
            _WorkspaceCurrencyCacheEntry(
              currency: currency,
              fetchedAt: DateTime.now(),
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
