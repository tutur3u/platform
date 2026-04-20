import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';
import 'package:mobile/features/finance/utils/wallet_ordering.dart';

part 'finance_state.dart';

const _sentinel = Object();

class FinanceCubit extends Cubit<FinanceState> {
  FinanceCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const FinanceState());

  final FinanceRepository _repo;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'finance:overview';
  static final Map<String, _FinanceCacheEntry> _cache = {};
  String? _loadedWorkspaceId;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid finance cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'finance.overview',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static String _memoryCacheKey(String wsId) => userScopedCacheKey(wsId);

  static void clearUserCache(String? userId) {
    if (userId == null || userId.isEmpty) {
      _cache.clear();
      return;
    }

    final prefix = '$userId::';
    _cache.removeWhere((key, value) => key.startsWith(prefix));
  }

  static Future<void> prewarm({
    required FinanceRepository financeRepository,
    required String wsId,
    bool forceRefresh = false,
  }) async {
    await CacheStore.instance.prefetch<FinanceState>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      fetch: () async {
        final wallets = await financeRepository.getWallets(wsId);
        final recentTransactions = await financeRepository
            .getTransactionsInfinite(
              wsId: wsId,
              limit: 10,
            );
        final workspaceCurrency = await financeRepository
            .getWorkspaceDefaultCurrency(wsId);
        final exchangeRates = await financeRepository
            .getExchangeRates()
            .catchError(
              (_) => <ExchangeRate>[],
            );
        final sortedWallets = sortWalletsForDisplay(
          wallets: wallets,
          workspaceCurrency: workspaceCurrency,
          exchangeRates: exchangeRates,
        );
        return {
          'wallets': sortedWallets
              .map((wallet) => wallet.toJson())
              .toList(growable: false),
          'recentTransactions': recentTransactions.data
              .map((transaction) => transaction.toJson())
              .toList(growable: false),
          'workspaceCurrency': workspaceCurrency,
          'exchangeRates': exchangeRates
              .map((rate) => rate.toJson())
              .toList(growable: false),
        };
      },
    );
  }

  /// Loads wallets and recent transactions for the workspace.
  Future<void> loadFinanceData(String wsId, {bool forceRefresh = false}) async {
    final cacheKey = _cacheKey(wsId);
    final memoryCacheKey = _memoryCacheKey(wsId);
    final diskCached = await CacheStore.instance.read<FinanceState>(
      key: cacheKey,
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    final cached = _cache[memoryCacheKey];
    final hasVisibleData = _loadedWorkspaceId == wsId;

    if (!forceRefresh && diskCached.hasValue && diskCached.data != null) {
      _loadedWorkspaceId = wsId;
      emit(diskCached.data!);
      if (diskCached.isFresh && diskCached.data!.hasWorkspaceCurrency) {
        return;
      }
    }

    if (!forceRefresh && cached != null) {
      _loadedWorkspaceId = wsId;
      emit(cached.state);
      if (isFinanceCacheFresh(cached.fetchedAt) &&
          cached.state.hasWorkspaceCurrency) {
        return;
      }
    } else if (!hasVisibleData) {
      emit(
        state.copyWith(
          status: FinanceStatus.loading,
          isFromCache: diskCached.hasValue,
          isRefreshing: diskCached.hasValue,
          lastUpdatedAt: diskCached.fetchedAt,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: FinanceStatus.loading,
          isFromCache: true,
          isRefreshing: true,
          lastUpdatedAt: cached?.fetchedAt ?? diskCached.fetchedAt,
          clearError: true,
        ),
      );
    }

    try {
      final walletsFuture = _repo.getWallets(wsId);
      final recentTransactionsFuture = _repo.getTransactionsInfinite(
        wsId: wsId,
        limit: 10,
      );
      final workspaceCurrencyFuture = _repo.getWorkspaceDefaultCurrency(wsId);
      final exchangeRatesFuture = _repo.getExchangeRates().catchError(
        (_) => <ExchangeRate>[],
      );

      final wallets = await walletsFuture;
      final recentTransactionsPage = await recentTransactionsFuture;
      final workspaceCurrency = await workspaceCurrencyFuture;
      final exchangeRates = await exchangeRatesFuture;

      final sortedWallets = sortWalletsForDisplay(
        wallets: wallets,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      );

      final nextState = state.copyWith(
        status: FinanceStatus.loaded,
        isFromCache: false,
        isRefreshing: false,
        lastUpdatedAt: null,
        wallets: sortedWallets,
        recentTransactions: recentTransactionsPage.data,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
        clearError: true,
      );

      _cache[memoryCacheKey] = _FinanceCacheEntry(
        state: nextState,
        fetchedAt: DateTime.now(),
      );
      _loadedWorkspaceId = wsId;
      emit(nextState);
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: _stateToCacheJson(nextState),
        tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      );
    } on Exception catch (e) {
      if (cached != null || hasVisibleData || diskCached.hasValue) {
        emit(
          (cached?.state ?? state).copyWith(
            status: FinanceStatus.loaded,
            isRefreshing: false,
            clearError: true,
          ),
        );
        return;
      }
      emit(
        state.copyWith(status: FinanceStatus.error, error: e.toString()),
      );
    }
  }

  static Map<String, dynamic> _stateToCacheJson(FinanceState state) {
    return {
      'wallets': state.wallets
          .map((wallet) => wallet.toJson())
          .toList(growable: false),
      'recentTransactions': state.recentTransactions
          .map((transaction) => transaction.toJson())
          .toList(growable: false),
      'workspaceCurrency': state.workspaceCurrency,
      'exchangeRates': state.exchangeRates
          .map((rate) => rate.toJson())
          .toList(growable: false),
      'lastUpdatedAt': state.lastUpdatedAt?.toIso8601String(),
    };
  }

  static FinanceState _stateFromCacheJson(Map<String, dynamic> json) {
    final workspaceCurrency = json['workspaceCurrency'] as String? ?? '';
    final exchangeRates =
        ((json['exchangeRates'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ExchangeRate.fromJson)
            .toList(growable: false);
    final wallets = ((json['wallets'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Wallet.fromJson)
        .toList(growable: false);

    return FinanceState(
      status: FinanceStatus.loaded,
      isFromCache: true,
      lastUpdatedAt: json['lastUpdatedAt'] != null
          ? DateTime.tryParse(json['lastUpdatedAt'] as String)
          : null,
      wallets: sortWalletsForDisplay(
        wallets: wallets,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      ),
      recentTransactions:
          ((json['recentTransactions'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(Transaction.fromJson)
              .toList(growable: false),
      workspaceCurrency: workspaceCurrency,
      exchangeRates: exchangeRates,
    );
  }
}

class _FinanceCacheEntry {
  const _FinanceCacheEntry({
    required this.state,
    required this.fetchedAt,
  });

  final FinanceState state;
  final DateTime fetchedAt;
}
