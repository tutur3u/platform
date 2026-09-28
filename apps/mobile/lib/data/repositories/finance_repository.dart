import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
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
  FinanceRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  @override
  final ApiClient _api;
  static const CachePolicy _workspaceCurrencyCachePolicy =
      CachePolicies.metadata;
  static const _workspaceCurrencyCacheTag = 'finance:workspace-currency';
  static final Map<String, _WorkspaceCurrencyCacheEntry>
  _workspaceCurrencyCache = {};
  static final Map<String, Future<String>> _workspaceCurrencyInFlight = {};

  static CacheKey _workspaceCurrencyCacheKey(String wsId) {
    return CacheKey(
      namespace: 'finance.workspaceCurrency',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static String _workspaceCurrencyMemoryKey(String wsId) =>
      userScopedCacheKey(wsId);

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
    return cached?.currency;
  }

  Future<String?> readWorkspaceDefaultCurrencyFromCache(String wsId) async {
    final memoryCached =
        _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)];
    if (memoryCached != null) {
      return memoryCached.currency;
    }

    final diskCached = await CacheStore.instance.read<String>(
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
    await CacheStore.instance.write(
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
    return _workspaceCurrencyInFlight.putIfAbsent(memoryKey, () async {
      try {
        final currency = await _fetchWorkspaceDefaultCurrencyRemote(wsId);
        final pending = OfflineMutationQueue.instance.pending.value
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
    final response = await _api.getJsonList(FinanceEndpoints.wallets(wsId));

    final wallets = response
        .map((e) => Wallet.fromJson(e as Map<String, dynamic>))
        .toList();
    return overlayPendingWallets(
      wsId,
      wallets,
      OfflineMutationQueue.instance.pending.value,
    );
  }

  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh) {
      final memoryCached =
          _workspaceCurrencyCache[_workspaceCurrencyMemoryKey(wsId)];
      if (memoryCached != null) {
        unawaited(_refreshWorkspaceDefaultCurrency(wsId));
        return memoryCached.currency;
      }

      final diskCached = await CacheStore.instance.read<String>(
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

    return await _refreshWorkspaceDefaultCurrency(wsId);
  }

  Future<void> updateWorkspaceDefaultCurrency({
    required String wsId,
    required String currency,
  }) async {
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'finance',
      method: 'PUT',
      path: FinanceEndpoints.workspaceConfig(wsId, 'DEFAULT_CURRENCY'),
      workspaceId: wsId,
      payload: {'value': currency.trim().toUpperCase()},
      entityId: wsId,
    )) {
      await _storeWorkspaceDefaultCurrencyCache(wsId: wsId, currency: currency);
      return;
    }
    await _api.putJson(
      FinanceEndpoints.workspaceConfig(wsId, 'DEFAULT_CURRENCY'),
      {'value': currency.trim().toUpperCase()},
    );
    await _storeWorkspaceDefaultCurrencyCache(wsId: wsId, currency: currency);
  }

  Future<List<ExchangeRate>> getExchangeRates() async {
    final response = await _api.getJson(FinanceEndpoints.exchangeRates);
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
    try {
      final response = await _api.getJson(
        FinanceEndpoints.wallet(wsId, walletId),
      );
      return Wallet.fromJson(response);
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
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
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'finance',
      method: 'POST',
      path: FinanceEndpoints.wallets(wsId),
      workspaceId: wsId,
      payload: {...body, 'id': id},
      entityId: id,
      replaySafe: true,
    )) {
      return;
    }
    try {
      await _api.postJson(FinanceEndpoints.wallets(wsId), {...body, 'id': id});
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'finance',
        method: 'POST',
        path: FinanceEndpoints.wallets(wsId),
        workspaceId: wsId,
        payload: {...body, 'id': id},
        entityId: id,
        replaySafe: true,
      )) {
        rethrow;
      }
    }
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

    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'finance',
      method: 'PUT',
      path: FinanceEndpoints.wallet(wsId, walletId),
      workspaceId: wsId,
      payload: payload,
      entityId: walletId,
    )) {
      return;
    }
    await _api.putJson(FinanceEndpoints.wallet(wsId, walletId), payload);
  }

  Future<void> deleteWallet({
    required String wsId,
    required String walletId,
  }) async {
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'finance',
      method: 'DELETE',
      path: FinanceEndpoints.wallet(wsId, walletId),
      workspaceId: wsId,
      entityId: walletId,
    )) {
      return;
    }
    await _api.deleteJson(FinanceEndpoints.wallet(wsId, walletId));
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
    final params = <String, String>{'limit': limit.toString()};
    if (cursor != null) params['cursor'] = cursor;
    if (search != null && search.isNotEmpty) params['q'] = search;
    if (walletId != null && walletId.isNotEmpty) params['walletId'] = walletId;

    final query = Uri(queryParameters: params).query;
    final response = await _api.getJson(
      '${FinanceEndpoints.infiniteTransactions(wsId)}?$query',
    );

    final page = InfiniteTransactionResponse.fromJson(response);
    return InfiniteTransactionResponse(
      data: cursor == null
          ? overlayPendingTransactions(
              wsId,
              page.data,
              OfflineMutationQueue.instance.pending.value,
              walletId: walletId,
              search: search,
            )
          : page.data,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    );
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
    final response = await _api.getJson(endpoint);
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
