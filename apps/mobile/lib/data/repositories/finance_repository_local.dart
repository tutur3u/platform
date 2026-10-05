part of 'finance_repository.dart';

extension _FinanceLocalReads on FinanceRepository {
  void _startHistoryBackfill(String wsId) {
    final userId = _cacheUserId();
    if (userId == null) return;
    final scope = '$userId:$wsId';
    final last = FinanceRepository._historyBackfillTimes[scope];
    if (last != null &&
        DateTime.now().difference(last) < const Duration(minutes: 15)) {
      return;
    }
    unawaited(
      FinanceRepository._historyBackfills.putIfAbsent(
        scope,
        () =>
            ApiClient.offlinePreparation(() async {
              if (await _backfillHistory(wsId, userId)) {
                FinanceRepository._historyBackfillTimes[scope] = DateTime.now();
              }
            }, allowChallenge: false).whenComplete(() {
              unawaited(FinanceRepository._historyBackfills.remove(scope));
            }),
      ),
    );
  }

  Future<bool> _backfillHistory(String wsId, String userId) async {
    String? cursor;
    final seen = <String>{};
    try {
      for (var index = 0; index < 5; index++) {
        if (_cacheUserId() != userId || !await _networkAvailable()) {
          return false;
        }
        final query = Uri(
          queryParameters: {
            'limit': '100',
            if (cursor != null) 'cursor': cursor,
          },
        ).query;
        final path = '${FinanceEndpoints.infiniteTransactions(wsId)}?$query';
        final response = await _cacheStore.prefetch<Map<String, dynamic>>(
          key: CacheKey(
            namespace: 'finance.infiniteTransactions',
            userId: userId,
            workspaceId: wsId,
            params: {'path': path},
          ),
          policy: CachePolicies.moduleData,
          forceRefresh: true,
          decode: (value) => Map<String, dynamic>.from(value! as Map),
          fetch: () async {
            try {
              return await _api.getJson(path);
            } on ApiException catch (error) {
              if (error.statusCode == 401 ||
                  (error.statusCode == 403 && !error.isVerificationRequired)) {
                await _cacheStore.clearScope(
                  userId: userId,
                  workspaceId: wsId,
                  namespace: 'finance.infiniteTransactions',
                  resourceOnly: true,
                );
              }
              rethrow;
            }
          },
          tags: ['module:finance', 'workspace:$wsId'],
        );
        if (_cacheUserId() != userId || response.data == null) return false;
        final page = InfiniteTransactionResponse.fromJson(response.data!);
        cursor = page.hasMore ? page.nextCursor : null;
        if (cursor != null && !seen.add(cursor)) return false;
        if (cursor == null) break;
      }
      return true;
    } on Object {
      // Optional history fill pauses on failure; next visit/reconnect retries.
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> _localFinanceRows(
    String wsId,
    List<String> namespaces,
  ) => queryLocalRows(
    store: _cacheStore,
    userId: _cacheUserId(),
    workspaceId: wsId,
    namespaces: namespaces,
  );

  Future<List<Transaction>> _localTransactions(
    String wsId, {
    String? walletId,
    String? search,
  }) async {
    final rows = await _localFinanceRows(wsId, const [
      'finance.transactions',
      'finance.infiniteTransactions',
      'finance.transactionDetail',
    ]);
    final transactions = overlayPendingTransactions(
      wsId,
      rows.map(Transaction.fromJson).toList(growable: false),
      await _mutationQueue.listPending(),
      walletId: walletId,
    );
    final query = search ?? '';
    final matcher = query.isEmpty ? null : compileLocalIlike(query);
    return transactions
        .where(
          (row) =>
              (walletId == null ||
                  walletId.isEmpty ||
                  row.walletId == walletId) &&
              (query.isEmpty ||
                  (row.description != '[CONFIDENTIAL]' &&
                      row.description != null &&
                      matcher!.hasMatch(row.description!))),
        )
        .toList(growable: false);
  }

  CacheKey _cursorAnchorKey(
    String wsId,
    String? userId,
    String cursor,
    String? search,
    String? walletId,
  ) => CacheKey(
    namespace: 'finance.cursorAnchors',
    userId: userId,
    workspaceId: wsId,
    params: {
      'cursor': cursor,
      'search': search ?? '',
      'walletId': walletId ?? '',
    },
  );

  Future<void> _rememberTransactionCursor(
    String wsId,
    String? userId,
    InfiniteTransactionResponse page,
    String? search,
    String? walletId,
  ) async {
    if (userId == null ||
        _cacheUserId() != userId ||
        page.nextCursor == null ||
        page.data.isEmpty) {
      return;
    }
    await _cacheStore.write(
      key: _cursorAnchorKey(wsId, userId, page.nextCursor!, search, walletId),
      policy: CachePolicies.moduleData,
      payload: {'anchorId': page.data.last.id},
      tags: ['module:finance', 'workspace:$wsId'],
    );
  }

  Future<InfiniteTransactionResponse> _localTransactionPage(
    String wsId, {
    required int limit,
    String? cursor,
    String? search,
    String? walletId,
  }) async {
    final rows = await _localTransactions(
      wsId,
      walletId: walletId,
      search: search,
    );
    String? anchor;
    if (cursor != null && !cursor.startsWith('local:')) {
      final cached = await _cacheStore.read<String>(
        key: _cursorAnchorKey(wsId, _cacheUserId(), cursor, search, walletId),
        decode: (value) => (value! as Map)['anchorId'] as String,
      );
      anchor = cached.data;
    }
    final after = cursor == null
        ? -1
        : rows.indexWhere(
            (row) => cursor.startsWith('local:')
                ? 'local:${row.id}' == cursor
                : row.id == anchor,
          );
    final page = cursor != null && after < 0
        ? <Transaction>[]
        : rows.skip(after + 1).take(limit).toList(growable: false);
    final hasMore = page.isNotEmpty && after + 1 + page.length < rows.length;
    return InfiniteTransactionResponse(
      data: page,
      hasMore: hasMore,
      nextCursor: hasMore ? 'local:${page.last.id}' : null,
    );
  }
}
