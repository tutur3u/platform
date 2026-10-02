import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
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
  FinanceCubit({
    required FinanceRepository financeRepository,
    CacheStore? cacheStore,
    String? Function()? currentUserId,
  }) : _repo = financeRepository,
       _store = cacheStore ?? CacheStore.instance,
       _mutationQueue = financeRepository.mutationQueue,
       _currentUserId = currentUserId ?? currentCacheUserId,
       super(const FinanceState()) {
    _mutationQueue.syncRevision.addListener(_onOfflineSync);
  }

  void _onOfflineSync() {
    final wsId = _requestedWorkspaceId;
    if (isClosed || wsId == null || _requestedUserId != _currentUserId()) {
      return;
    }
    unawaited(loadFinanceData(wsId).then<void>((_) {}, onError: (Object _) {}));
  }

  @override
  Future<void> close() {
    _generation++;
    _mutationQueue.syncRevision.removeListener(_onOfflineSync);
    return super.close();
  }

  final FinanceRepository _repo;
  final OfflineMutationQueue _mutationQueue;
  final CacheStore _store;
  final String? Function() _currentUserId;
  int _generation = 0;
  String? _requestedWorkspaceId;
  String? _loadedUserId;
  String? _requestedUserId;

  bool _isCurrent(int generation, String? userId, String wsId) =>
      !isClosed &&
      _generation == generation &&
      _currentUserId() == userId &&
      _requestedWorkspaceId == wsId;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const String _cacheTag = financeOverviewCacheTag;
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

  static void clearWorkspaceCache(String wsId) {
    _cache.remove(_memoryCacheKey(wsId));
  }

  static Future<void> prewarm({
    required FinanceRepository financeRepository,
    required String wsId,
    bool forceRefresh = false,
  }) async {
    final userId = currentCacheUserId();
    void ensureActor() {
      if (currentCacheUserId() != userId) {
        throw StateError('Finance prewarm account changed.');
      }
    }

    await CacheStore.instance.prefetch<FinanceState>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      fetch: () async {
        ensureActor();
        final (
          wallets,
          recentTransactions,
          workspaceCurrency,
          exchangeRates,
        ) = await (
          financeRepository.getWallets(wsId),
          financeRepository.getTransactionsInfinite(wsId: wsId, limit: 10),
          financeRepository.getWorkspaceDefaultCurrency(wsId),
          financeRepository.getExchangeRates().catchError(
            (_) => <ExchangeRate>[],
          ),
        ).wait;
        ensureActor();
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
    if (isClosed) {
      return;
    }
    final generation = ++_generation;
    final userId = _currentUserId();
    _requestedWorkspaceId = wsId;
    _requestedUserId = userId;
    final hasVisibleData =
        _loadedWorkspaceId == wsId && _loadedUserId == userId;
    if (!hasVisibleData) {
      emit(const FinanceState(status: FinanceStatus.loading));
    }
    final cacheKey = CacheKey(
      namespace: 'finance.overview',
      userId: userId,
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
    final memoryCacheKey = '${userId ?? 'anonymous'}::$wsId';
    final diskCached = await _store.read<FinanceState>(
      key: cacheKey,
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!_isCurrent(generation, userId, wsId)) {
      return;
    }
    final cached = _cache[memoryCacheKey];
    final hasDiskSnapshot = diskCached.hasValue && diskCached.data != null;
    final shouldShowDiskSnapshot =
        hasDiskSnapshot && (!forceRefresh || !hasVisibleData);

    if (shouldShowDiskSnapshot) {
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      emit(diskCached.data!);
    }

    if (!forceRefresh && cached != null) {
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      emit(cached.state);
    } else if (!hasVisibleData && !shouldShowDiskSnapshot) {
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
          status: FinanceStatus.loaded,
          isFromCache: state.isFromCache || shouldShowDiskSnapshot,
          isRefreshing: true,
          lastUpdatedAt: cached?.fetchedAt ?? diskCached.fetchedAt,
          clearError: true,
        ),
      );
    }

    try {
      final walletsFuture = CacheStore.awaitRevalidation(
        () => _repo.getWallets(wsId),
      );
      final recentTransactionsFuture = CacheStore.awaitRevalidation(
        () => _repo.getTransactionsInfinite(wsId: wsId, limit: 10),
      );
      final workspaceCurrencyFuture = CacheStore.awaitRevalidation(
        () => _repo.getWorkspaceDefaultCurrency(wsId),
      );
      final exchangeRatesFuture = CacheStore.awaitRevalidation(
        _repo.getExchangeRates,
      ).catchError((_) => <ExchangeRate>[]);

      final (
        wallets,
        recentTransactionsPage,
        workspaceCurrency,
        exchangeRates,
      ) = await (
        walletsFuture,
        recentTransactionsFuture,
        workspaceCurrencyFuture,
        exchangeRatesFuture,
      ).wait;
      if (!_isCurrent(generation, userId, wsId)) {
        return;
      }

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
      _loadedUserId = userId;
      emit(nextState);
      await _store.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: _stateToCacheJson(nextState),
        tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      );
    } on Object catch (e) {
      if (!_isCurrent(generation, userId, wsId)) {
        return;
      }
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
      emit(state.copyWith(status: FinanceStatus.error, error: e.toString()));
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
  const _FinanceCacheEntry({required this.state, required this.fetchedAt});

  final FinanceState state;
  final DateTime fetchedAt;
}
