import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_pending_overlay.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/utils/finance_flow.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({
    required FinanceRepository financeRepository,
    TransactionListState? initialState,
    CacheStore? cacheStore,
    String? Function()? currentUserId,
  }) : _repo = financeRepository,
       _store = cacheStore ?? CacheStore.instance,
       _mutationQueue = financeRepository.mutationQueue,
       _currentUserId = currentUserId ?? currentCacheUserId,
       _initialQuery = initialState?.query ?? const FinanceTransactionQuery(),
       super(initialState ?? const TransactionListState()) {
    _mutationQueue.syncRevision.addListener(_onOfflineSync);
  }

  void _onOfflineSync() {
    if (isClosed || _wsId.isEmpty || _requestedUserId != _currentUserId()) {
      return;
    }
    unawaited(load(_wsId).then<void>((_) {}, onError: (Object _) {}));
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
  final FinanceTransactionQuery _initialQuery;
  int _generation = 0;
  String? _loadedUserId;
  String? _requestedUserId;

  /// Consecutive filtered pages that matched nothing; bounds the automatic
  /// reads for kinds the server cannot filter.
  int _emptyFilteredPages = 0;
  static const _maxEmptyFilteredPages = 5;

  bool _isCurrent(int generation, String? userId, String wsId, String scope) =>
      !isClosed &&
      generation == _generation &&
      _currentUserId() == userId &&
      _wsId == wsId &&
      state.scopeKey == scope;

  /// [resolved] with this scope's filters, for cached snapshots.
  TransactionListState _withScope(
    TransactionListState resolved,
    TransactionListState scope,
  ) => resolved.copyWith(
    search: scope.search,
    query: scope.query,
    walletId: scope.walletId,
    wallets: scope.wallets.isEmpty ? null : scope.wallets,
    categories: scope.categories.isEmpty ? null : scope.categories,
  );

  CacheKey _requestKey(String wsId, String? userId, String scope) => CacheKey(
    namespace: 'finance.transactions',
    userId: userId,
    workspaceId: wsId,
    locale: currentCacheLocaleTag(),
    params: {'search': scope},
  );
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'finance:transactions';
  static final Map<String, _TransactionListCacheEntry> _cache = {};

  String _wsId = '';
  String? _loadedWorkspaceId;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid transaction list cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _storeKey(String wsId, {String search = ''}) {
    return CacheKey(
      namespace: 'finance.transactions',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'search': search},
    );
  }

  static TransactionListState? seedStateForWorkspace(
    String wsId, {
    String search = '',
  }) {
    final cached = CacheStore.instance.peek<TransactionListState>(
      key: _storeKey(wsId, search: search),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!cached.hasValue || cached.data == null) {
      return null;
    }
    return cached.data;
  }

  /// Initialise with workspace ID and load the first page.
  Future<void> load(String wsId, {bool forceRefresh = false}) async {
    if (isClosed) {
      return;
    }
    final generation = ++_generation;
    final userId = _currentUserId();
    final hasVisibleData =
        _loadedWorkspaceId == wsId && _loadedUserId == userId;
    final keepScope = hasVisibleData && _wsId == wsId;
    _wsId = wsId;
    _requestedUserId = userId;
    emit(
      hasVisibleData
          ? state.copyWith(
              search: keepScope ? null : '',
              query: keepScope ? null : _initialQuery,
              walletId: keepScope ? state.walletId : null,
              status: TransactionListStatus.loading,
              clearCursor: true,
              clearError: true,
            )
          : TransactionListState(
              status: TransactionListStatus.loading,
              query: _initialQuery,
            ),
    );
    final scope = state.scopeKey;
    final scopeState = state;
    final cacheId = '${userId ?? 'anonymous'}::$wsId::$scope';
    final cached = _cache[cacheId];
    final diskCached = await _store.read<TransactionListState>(
      key: _requestKey(wsId, userId, scope),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!_isCurrent(generation, userId, wsId, scope)) {
      return;
    }
    final resolvedCached = cached?.state ?? diskCached.data;
    if (resolvedCached != null && (!forceRefresh || !hasVisibleData)) {
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      final scoped = _withScope(resolvedCached, scopeState);
      emit(scoped);
      emit(
        scoped.copyWith(
          status: TransactionListStatus.loading,
          hasMore: true,
          clearCursor: true,
          clearError: true,
        ),
      );
    }

    try {
      final workspaceCurrencyFuture = CacheStore.awaitRevalidation(
        () => _repo.getWorkspaceDefaultCurrency(wsId),
      );
      final exchangeRatesFuture = CacheStore.awaitRevalidation(
        _repo.getExchangeRates,
      ).catchError((_) => <ExchangeRate>[]);

      final walletsFuture = _repo
          .getWallets(wsId)
          .catchError((_) => <Wallet>[]);
      final categoriesFuture = _repo
          .getCategories(wsId)
          .catchError((_) => <TransactionCategory>[]);

      final (workspaceCurrency, exchangeRates, wallets, categories) = await (
        workspaceCurrencyFuture,
        exchangeRatesFuture,
        walletsFuture,
        categoriesFuture,
      ).wait;
      if (!_isCurrent(generation, userId, wsId, scope)) {
        return;
      }

      _loadedUserId = userId;
      emit(
        state.copyWith(
          workspaceCurrency: workspaceCurrency,
          exchangeRates: exchangeRates,
          wallets: wallets,
          categories: categories,
        ),
      );

      await _fetch(replaceExisting: true, generation: generation);
    } on Object catch (error) {
      if (!_isCurrent(generation, userId, wsId, scope)) {
        return;
      }
      emit(
        state.copyWith(
          status: state.transactions.isEmpty
              ? TransactionListStatus.error
              : TransactionListStatus.loaded,
          error: error.toString(),
        ),
      );
    }
  }

  /// Load the next page (no-op if already loading or no more pages).
  Future<void> loadMore() async {
    if (isClosed ||
        state.status == TransactionListStatus.loading ||
        !state.hasMore) {
      return;
    }
    emit(
      state.copyWith(status: TransactionListStatus.loading, clearError: true),
    );
    await _fetch(replaceExisting: false, generation: _generation);
  }

  /// Update the search query and reload from scratch.
  Future<void> setSearch(String query) async {
    if (isClosed || query == state.search) {
      return;
    }
    await _reloadScope(state.copyWith(search: query));
  }

  /// Apply kind, category, date and wallet filters and reload from scratch.
  Future<void> setFilters({
    required FinanceTransactionQuery query,
    required String? walletId,
    bool clearSearch = false,
  }) async {
    if (isClosed ||
        (query == state.query &&
            walletId == state.walletId &&
            (!clearSearch || state.search.isEmpty))) {
      return;
    }
    await _reloadScope(
      state.copyWith(
        query: query,
        walletId: walletId,
        search: clearSearch ? '' : null,
      ),
    );
  }

  Future<void> _reloadScope(TransactionListState target) async {
    final generation = ++_generation;
    final userId = _currentUserId();
    final wsId = _wsId;
    _emptyFilteredPages = 0;
    if (_loadedUserId != userId) {
      emit(const TransactionListState());
    }
    final loading = state.copyWith(
      search: target.search,
      query: target.query,
      walletId: target.walletId,
      status: TransactionListStatus.loading,
      transactions: [],
      hasMore: true,
      clearCursor: true,
      clearError: true,
      clearFlow: true,
    );
    emit(loading);
    final scope = loading.scopeKey;
    final cached = _cache['${userId ?? 'anonymous'}::$wsId::$scope'];
    final diskCached = await _store.read<TransactionListState>(
      key: _requestKey(wsId, userId, scope),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!_isCurrent(generation, userId, wsId, scope)) {
      return;
    }
    final resolvedCached = cached?.state ?? diskCached.data;
    if (resolvedCached != null) {
      final scoped = _withScope(resolvedCached, loading);
      emit(scoped);
      emit(
        scoped.copyWith(
          status: TransactionListStatus.loading,
          hasMore: true,
          clearCursor: true,
          clearError: true,
        ),
      );
    }
    await _fetch(replaceExisting: true, generation: generation);
  }

  /// Totals cover a dated range only; all-time totals would read every page.
  Future<void> _loadFlow(int generation, String? userId) async {
    final wsId = _wsId;
    final scoped = state;
    final scope = scoped.scopeKey;
    if (wsId.isEmpty ||
        !scoped.hasWorkspaceCurrency ||
        scoped.query.start == null ||
        scoped.query.kind == FinanceTransactionKind.transfer) {
      return;
    }
    try {
      final flow = await loadFinanceFlow(
        repository: _repo,
        wsId: wsId,
        currency: scoped.flowCurrency,
        rates: scoped.exchangeRates,
        query: scoped.query,
        walletId: scoped.walletId,
        search: scoped.search.isEmpty ? null : scoped.search,
      );
      if (!_isCurrent(generation, userId, wsId, scope)) return;
      emit(state.copyWith(flow: flow));
    } on Object {
      // The summary keeps its placeholder; the list stays usable.
    }
  }

  Future<void> _fetch({required bool replaceExisting, int? generation}) async {
    if (isClosed) {
      return;
    }
    final requestGeneration = generation ?? ++_generation;
    final userId = _currentUserId();
    final wsId = _wsId;
    final search = state.search;
    if (_loadedUserId != userId) {
      emit(
        TransactionListState(
          search: search,
          query: state.query,
          walletId: state.walletId,
        ),
      );
    }
    final requestState = state;
    final scope = requestState.scopeKey;
    final storeKey = _requestKey(wsId, userId, scope);
    if (wsId.isEmpty) {
      emit(
        state.copyWith(
          status: TransactionListStatus.loaded,
          hasMore: false,
          clearCursor: true,
          clearError: true,
        ),
      );
      return;
    }
    try {
      final result = await CacheStore.awaitRevalidation(
        () => _repo.getTransactionsInfinite(
          wsId: wsId,
          cursor: replaceExisting ? null : requestState.cursor,
          search: search.isEmpty ? null : search,
          walletId: requestState.walletId,
          query: requestState.query,
        ),
      );

      if (!_isCurrent(requestGeneration, userId, wsId, scope)) {
        return;
      }
      final allTransactions = replaceExisting
          ? result.data
          : [...requestState.transactions, ...result.data];
      final normalizedTransactions = collapseTransferTransactions(
        allTransactions,
      );
      final nextState = state.copyWith(
        status: TransactionListStatus.loaded,
        transactions: normalizedTransactions,
        hasMore: result.hasMore,
        cursor: result.nextCursor,
        clearError: true,
      );

      _cache['${userId ?? 'anonymous'}::$wsId::$scope'] =
          _TransactionListCacheEntry(
            state: nextState,
            fetchedAt: DateTime.now(),
          );
      await _store.write(
        key: storeKey,
        policy: _cachePolicy,
        payload: _stateToCacheJson(nextState),
        tags: [_cacheTag, 'workspace:$wsId', 'module:finance'],
      );
      if (!_isCurrent(requestGeneration, userId, wsId, scope)) {
        return;
      }
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      emit(nextState);
      if (replaceExisting) {
        unawaited(_loadFlow(requestGeneration, userId));
      }
      if (requestState.hasFilters && result.data.isEmpty && result.hasMore) {
        if (++_emptyFilteredPages <= _maxEmptyFilteredPages) {
          unawaited(loadMore());
        }
      } else {
        _emptyFilteredPages = 0;
      }
    } on Object catch (e) {
      if (!_isCurrent(requestGeneration, userId, wsId, scope)) {
        return;
      }
      final visible = overlayPendingTransactions(
        _wsId,
        state.transactions,
        _mutationQueue.pending.value,
        search: state.search,
      );
      if (visible.isNotEmpty) {
        emit(
          state.copyWith(
            status: TransactionListStatus.loaded,
            transactions: visible,
            error: e.toString(),
          ),
        );
        return;
      }
      if (state.transactions.isNotEmpty) {
        emit(
          state.copyWith(
            status: TransactionListStatus.loaded,
            error: e.toString(),
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          status: TransactionListStatus.error,
          error: e.toString(),
        ),
      );
    }
  }
}

class _TransactionListCacheEntry {
  const _TransactionListCacheEntry({
    required this.state,
    required this.fetchedAt,
  });

  final TransactionListState state;
  final DateTime fetchedAt;
}

Map<String, dynamic> _stateToCacheJson(TransactionListState state) {
  return {
    'transactions': state.transactions
        .map((transaction) => transaction.toJson())
        .toList(growable: false),
    'workspaceCurrency': state.workspaceCurrency,
    'exchangeRates': state.exchangeRates
        .map((rate) => rate.toJson())
        .toList(growable: false),
    'hasMore': state.hasMore,
    'cursor': state.cursor,
    'search': state.search,
  };
}

TransactionListState _stateFromCacheJson(Map<String, dynamic> json) {
  return TransactionListState(
    status: TransactionListStatus.loaded,
    transactions:
        ((json['transactions'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(Transaction.fromJson)
            .toList(growable: false),
    workspaceCurrency: json['workspaceCurrency'] as String? ?? '',
    exchangeRates:
        ((json['exchangeRates'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ExchangeRate.fromJson)
            .toList(growable: false),
    hasMore: json['hasMore'] as bool? ?? true,
    cursor: json['cursor'] as String?,
    search: json['search'] as String? ?? '',
  );
}
