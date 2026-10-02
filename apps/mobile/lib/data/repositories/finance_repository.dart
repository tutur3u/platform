import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/cache/local_replica_query.dart';
import 'package:mobile/core/cache/local_search.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/repositories/finance_pending_overlay.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';

part 'finance_repository_local.dart';
part 'finance_repository_offline_preparation.dart';
part 'finance_repository_checkpoints.dart';
part 'finance_repository_attachments.dart';
part 'finance_repository_transaction_lookup.dart';
part 'finance_repository_mutations.dart';
part 'finance_repository_taxonomy.dart';

/// Repository for finance operations (wallets, transactions, categories).
class FinanceRepository
    with
        FinanceRepositoryAttachments,
        FinanceRepositoryMutations,
        FinanceRepositoryTaxonomy {
  FinanceRepository({
    ApiClient? apiClient,
    CacheStore? cacheStore,
    OfflineMutationQueue? mutationQueue,
    String? Function()? cacheUserId,
    Future<bool> Function()? networkAvailable,
  }) : _api = apiClient ?? ApiClient(),
       _cacheStore = cacheStore ?? CacheStore.instance,
       _mutationQueue = mutationQueue ?? OfflineMutationQueue.instance,
       _cacheUserId = cacheUserId ?? currentCacheUserId,
       _networkAvailable = networkAvailable ?? hasNetworkConnection;

  @override
  final CacheStore _cacheStore;
  @override
  final OfflineMutationQueue _mutationQueue;
  @override
  final String? Function() _cacheUserId;
  final Future<bool> Function() _networkAvailable;

  OfflineMutationQueue get mutationQueue => _mutationQueue;

  @override
  final ApiClient _api;
  static const CachePolicy _workspaceCurrencyCachePolicy =
      CachePolicies.metadata;
  static const _workspaceCurrencyCacheTag = 'finance:workspace-currency';
  static final Map<String, _WorkspaceCurrencyCacheEntry>
  _workspaceCurrencyCache = {};
  static final Map<String, Future<String>> _workspaceCurrencyInFlight = {};
  static final Map<String, Future<void>> _historyBackfills = {};
  static final Map<String, DateTime> _historyBackfillTimes = {};

  CacheKey _workspaceCurrencyCacheKey(String wsId) {
    return CacheKey(
      namespace: 'finance.workspaceCurrency',
      userId: _cacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  String _workspaceCurrencyMemoryKey(String wsId) => '${_cacheUserId()}:$wsId';

  static String _decodeWorkspaceCurrency(Object? json) {
    if (json is! String) {
      throw const FormatException('Invalid workspace currency cache payload.');
    }
    return json.trim().toUpperCase();
  }

  static String _normalizeWorkspaceCurrencyValue(String? value) {
    final resolved = value?.trim().toUpperCase();
    if (resolved == null || resolved.isEmpty) {
      return 'USD';
    }
    return resolved;
  }

  String? peekWorkspaceDefaultCurrency(String wsId) {
    final cached = _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)];
    if (cached != null) return cached.currency;

    // CacheStore hydrates its encrypted snapshot at app startup. Keep the
    // synchronous path useful across launches so price cards render with the
    // correct symbol on their first frame.
    final stored = _cacheStore.peek<String>(
      key: _workspaceCurrencyCacheKey(wsId),
      decode: _decodeWorkspaceCurrency,
    );
    if (!stored.hasValue || stored.data == null) return null;
    _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(
      wsId,
    )] = _WorkspaceCurrencyCacheEntry(
      currency: stored.data!,
      fetchedAt: stored.fetchedAt ?? DateTime.now(),
    );
    return stored.data;
  }

  Future<String?> readWorkspaceDefaultCurrencyFromCache(String wsId) async {
    final memoryCached =
        _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)];
    if (memoryCached != null) {
      return memoryCached.currency;
    }

    final diskCached = await _cacheStore.read<String>(
      key: _workspaceCurrencyCacheKey(wsId),
      decode: _decodeWorkspaceCurrency,
    );
    if (!diskCached.hasValue || diskCached.data == null) {
      return null;
    }

    _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(
      wsId,
    )] = _WorkspaceCurrencyCacheEntry(
      currency: diskCached.data!,
      fetchedAt: diskCached.fetchedAt ?? DateTime.now(),
    );
    return diskCached.data;
  }

  Future<void> _storeWorkspaceDefaultCurrencyCache({
    required String wsId,
    required String currency,
  }) async {
    final normalized = _normalizeWorkspaceCurrencyValue(currency);
    final now = DateTime.now();
    _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)] =
        _WorkspaceCurrencyCacheEntry(currency: normalized, fetchedAt: now);
    await _cacheStore.write(
      key: _workspaceCurrencyCacheKey(wsId),
      policy: _workspaceCurrencyCachePolicy,
      payload: normalized,
      tags: [_workspaceCurrencyCacheTag, 'workspace:$wsId', 'module:finance'],
    );
  }

  Future<String> _fetchWorkspaceDefaultCurrencyRemote(String wsId) async {
    try {
      final response = await _api.getJson(
        FinanceEndpoints.workspaceConfig(wsId, 'DEFAULT_CURRENCY'),
      );
      return _normalizeWorkspaceCurrencyValue(response['value'] as String?);
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        return 'USD';
      }
      rethrow;
    }
  }

  Future<String> _refreshWorkspaceDefaultCurrency(String wsId) {
    final memoryKey = _workspaceCurrencyMemoryKey(wsId);
    final user = _cacheUserId();
    return _workspaceCurrencyInFlight.putIfAbsent(memoryKey, () async {
      try {
        final currency = await _fetchWorkspaceDefaultCurrencyRemote(wsId);
        if (_cacheUserId() != user) {
          throw StateError('Finance account changed.');
        }
        final pending = _mutationQueue.pending.value
            .where(
              (record) =>
                  record.feature == 'finance' &&
                  record.workspaceId == wsId &&
                  record.path ==
                      FinanceEndpoints.workspaceConfig(
                        wsId,
                        'DEFAULT_CURRENCY',
                      ),
            )
            .lastOrNull;
        if (pending != null) {
          return _normalizeWorkspaceCurrencyValue(
            pending.payload?['value'] as String?,
          );
        }
        await _storeWorkspaceDefaultCurrencyCache(
          wsId: wsId,
          currency: currency,
        );
        return currency;
      } finally {
        unawaited(_workspaceCurrencyInFlight.remove(memoryKey));
      }
    });
  }

  // ── Wallets ─────────────────────────────────────

  Future<List<Wallet>> getWallets(String wsId) async {
    List<dynamic> response;
    try {
      response = await readThroughJsonList(
        api: _api,
        namespace: 'finance.wallets',
        workspaceId: wsId,
        path: FinanceEndpoints.wallets(wsId),
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      response = await _localFinanceRows(wsId, const [
        'finance.wallets',
        'finance.walletDetail',
      ]);
    }

    final wallets = response
        .map((e) => Wallet.fromJson(e as Map<String, dynamic>))
        .toList();
    return overlayPendingWallets(wsId, wallets, _mutationQueue.pending.value);
  }

  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh && !CacheStore.awaitingRevalidation) {
      final memoryCached =
          _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)];
      if (memoryCached != null) {
        unawaited(_refreshWorkspaceDefaultCurrency(wsId));
        return memoryCached.currency;
      }

      final diskCached = await _cacheStore.read<String>(
        key: _workspaceCurrencyCacheKey(wsId),
        decode: _decodeWorkspaceCurrency,
      );
      if (diskCached.hasValue && diskCached.data != null) {
        _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(
          wsId,
        )] = _WorkspaceCurrencyCacheEntry(
          currency: diskCached.data!,
          fetchedAt: diskCached.fetchedAt ?? DateTime.now(),
        );
        unawaited(_refreshWorkspaceDefaultCurrency(wsId));
        return diskCached.data!;
      }
    }

    try {
      return await _refreshWorkspaceDefaultCurrency(wsId);
    } on Object catch (error) {
      if (!CacheStore.awaitingRevalidation ||
          !isOfflineTransportFailure(error)) {
        rethrow;
      }
      final cached = await readWorkspaceDefaultCurrencyFromCache(wsId);
      if (cached == null) rethrow;
      return cached;
    }
  }

  Future<void> updateWorkspaceDefaultCurrency({
    required String wsId,
    required String currency,
  }) async {
    final path = FinanceEndpoints.workspaceConfig(wsId, 'DEFAULT_CURRENCY');
    final payload = {'value': currency.trim().toUpperCase()};
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: wsId,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
    await _storeWorkspaceDefaultCurrencyCache(wsId: wsId, currency: currency);
  }

  Future<List<ExchangeRate>> getExchangeRates() async {
    final response = await readThroughJson(
      api: _api,
      namespace: 'finance.exchangeRates',
      workspaceId: 'global',
      path: FinanceEndpoints.exchangeRates,
      policy: CachePolicies.metadata,
      cacheStore: _cacheStore,
      cacheUserId: _cacheUserId,
    );
    final data = response['data'];
    if (data is! List<dynamic>) return const [];

    return data
        .whereType<Map<String, dynamic>>()
        .map(ExchangeRate.fromJson)
        .toList();
  }

  Future<Wallet?> getWalletById({
    required String wsId,
    required String walletId,
  }) async {
    Wallet? wallet;
    try {
      final response = await readThroughJson(
        api: _api,
        namespace: 'finance.walletDetail',
        workspaceId: wsId,
        path: FinanceEndpoints.wallet(wsId, walletId),
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
      );
      wallet = Wallet.fromJson(response);
    } on Object catch (error) {
      if (error is ApiException && error.statusCode == 404) {
        final pending = await _mutationQueue.listPending();
        if (!pending.any(
          (row) =>
              row.feature == 'finance' &&
              row.workspaceId == wsId &&
              row.entityId == walletId &&
              (row.path == FinanceEndpoints.wallets(wsId) ||
                  row.path == FinanceEndpoints.wallet(wsId, walletId)),
        )) {
          return null;
        }
      }
      if (!(error is ApiException && error.statusCode == 404) &&
          !isOfflineTransportFailure(error)) {
        rethrow;
      }
      final local = await _localFinanceRows(wsId, const [
        'finance.wallets',
        'finance.walletDetail',
      ]);
      final row = local.where((row) => row['id'] == walletId).firstOrNull;
      if (row != null) wallet = Wallet.fromJson(row);
    }
    return overlayPendingWallets(
      wsId,
      [if (wallet != null) wallet],
      await _mutationQueue.listPending(),
    ).where((row) => row.id == walletId).firstOrNull;
  }

  Future<void> createWallet({
    required String wsId,
    required String name,
    required String type,
    required String currency,
    String? description,
    String? icon,
    String? imageSrc,
    double? limit,
    int? statementDate,
    int? paymentDate,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'description': description,
      'type': type,
      'currency': currency,
      'icon': icon,
      'image_src': imageSrc,
      'limit': limit,
      'statement_date': statementDate,
      'payment_date': paymentDate,
    };
    final id = newLocalMutationId();
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'POST',
      path: FinanceEndpoints.wallets(wsId),
      workspaceId: wsId,
      payload: {...body, 'id': id},
      entityId: id,
      replaySafe: true,
      send: () async {
        throw StateError('Wallet create uses durable replay');
      },
    );
  }

  Future<void> updateWallet({
    required String wsId,
    required String walletId,
    required String name,
    required String type,
    required String currency,
    String? description,
    String? icon,
    String? imageSrc,
    double? limit,
    int? statementDate,
    int? paymentDate,
  }) async {
    final payload = <String, dynamic>{
      'name': name,
      'description': description,
      'type': type,
      'currency': currency,
      'icon': icon,
      'image_src': imageSrc,
      'limit': limit,
      'statement_date': statementDate,
      'payment_date': paymentDate,
    };

    final path = FinanceEndpoints.wallet(wsId, walletId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: walletId,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<void> deleteWallet({
    required String wsId,
    required String walletId,
  }) async {
    final path = FinanceEndpoints.wallet(wsId, walletId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: walletId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  // ── Transactions ────────────────────────────────

  /// Fetches transactions for the given [walletIds].
  ///
  /// `wallet_transactions` does not have a `ws_id` column — transactions are
  /// scoped through their wallet's workspace. Call [getWallets] first to obtain
  /// the wallet IDs for a workspace.
  Future<List<Transaction>> getTransactions({
    required List<String> walletIds,
    int limit = 50,
    int offset = 0,
  }) async {
    if (walletIds.isEmpty) return [];

    final response = await supabase
        .from('wallet_transactions')
        .select('''
          *,
          category:transaction_categories(name)
        ''')
        .inFilter('wallet_id', walletIds)
        .order('taken_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Cursor-based paginated fetch via the web API
  /// (`/api/workspaces/[wsId]/transactions/infinite`).
  ///
  /// Returns an [InfiniteTransactionResponse] with enriched transaction data
  /// (tags, category icon/color, creator, transfer metadata).
  Future<InfiniteTransactionResponse> getTransactionsInfinite({
    required String wsId,
    int limit = 20,
    String? cursor,
    String? search,
    String? walletId,
  }) async {
    final userId = _cacheUserId();
    if (cursor?.startsWith('local:') == true || !await _networkAvailable()) {
      return await _localTransactionPage(
        wsId,
        limit: limit,
        cursor: cursor,
        search: search,
        walletId: walletId,
      );
    }
    try {
      final params = <String, String>{'limit': limit.toString()};
      if (cursor != null) params['cursor'] = cursor;
      if (search != null && search.isNotEmpty) params['q'] = search;
      if (walletId != null && walletId.isNotEmpty) {
        params['walletId'] = walletId;
      }

      final query = Uri(queryParameters: params).query;
      final response = await readThroughJson(
        api: _api,
        namespace: 'finance.infiniteTransactions',
        workspaceId: wsId,
        path: '${FinanceEndpoints.infiniteTransactions(wsId)}?$query',
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
      );

      final page = InfiniteTransactionResponse.fromJson(response);
      await _rememberTransactionCursor(wsId, userId, page, search, walletId);
      if (cursor == null &&
          (search == null || search.isEmpty) &&
          walletId == null) {
        _startHistoryBackfill(wsId);
      }
      return InfiniteTransactionResponse(
        data: cursor == null
            ? overlayPendingTransactions(
                wsId,
                page.data,
                _mutationQueue.pending.value,
                walletId: walletId,
                search: search,
              )
            : page.data,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      );
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      return await _localTransactionPage(
        wsId,
        limit: limit,
        cursor: cursor,
        search: search,
        walletId: walletId,
      );
    }
  }

  Future<TransactionStats> getTransactionStats({
    required String wsId,
    String? walletId,
    String? search,
  }) async {
    final params = <String, String>{};
    if (walletId != null && walletId.isNotEmpty) params['walletId'] = walletId;
    if (search != null && search.isNotEmpty) params['q'] = search;

    final query = Uri(queryParameters: params).query;
    final endpoint = query.isEmpty
        ? FinanceEndpoints.transactionStats(wsId)
        : '${FinanceEndpoints.transactionStats(wsId)}?$query';
    final response = await readThroughJson(
      api: _api,
      namespace: 'finance.transactionStats',
      workspaceId: wsId,
      path: endpoint,
      cacheStore: _cacheStore,
      cacheUserId: _cacheUserId,
    );
    return TransactionStats.fromJson(response);
  }

  ///
  /// [cursor] is a composite `{taken_at}_{created_at}` string.  Pass `null`
  /// for the first page.  Returns `limit + 1` rows so the caller can detect
  /// whether more pages exist (pop the extra row if present).
  Future<List<Transaction>> getTransactionsPaginated({
    required List<String> walletIds,
    int limit = 20,
    String? cursor,
    String? search,
  }) async {
    if (walletIds.isEmpty) return [];

    // Filters must be applied *before* order/limit (PostgREST builder types).
    var query = supabase
        .from('wallet_transactions')
        .select('''
          *,
          category:transaction_categories(name)
        ''')
        .inFilter('wallet_id', walletIds);

    // Cursor filter — fetch rows *before* the cursor position.
    if (cursor != null) {
      final parts = cursor.split('_');
      if (parts.length >= 2) {
        final takenAt = parts.sublist(0, parts.length - 1).join('_');
        query = query.lt('taken_at', takenAt);
      }
    }

    // Text search on description (PostgREST ilike).
    if (search != null && search.isNotEmpty) {
      query = query.ilike('description', '%$search%');
    }

    // Order + fetch one extra to detect hasMore.
    final response = await query
        .order('taken_at', ascending: false)
        .order('created_at', ascending: false)
        .limit(limit + 1);

    return (response as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

class _WorkspaceCurrencyCacheEntry {
  const _WorkspaceCurrencyCacheEntry({
    required this.currency,
    required this.fetchedAt,
  });

  final String currency;
  final DateTime fetchedAt;
}

@visibleForTesting
void debugClearFinanceRepositoryWorkspaceCurrencyCache() {
  FinanceRepository._workspaceCurrencyCache.clear();
  FinanceRepository._workspaceCurrencyInFlight.clear();
}
