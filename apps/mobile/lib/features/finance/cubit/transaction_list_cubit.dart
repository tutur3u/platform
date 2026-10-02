import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_pending_overlay.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({
    required FinanceRepository financeRepository,
    TransactionListState? initialState,
    CacheStore? cacheStore,
    String? Function()? currentUserId,
  }) : _repo = financeRepository,
       _store = cacheStore ?? CacheStore.instance,
       _currentUserId = currentUserId ?? currentCacheUserId,
       super(initialState ?? const TransactionListState()) {
    OfflineMutationQueue.instance.syncRevision.addListener(_onOfflineSync);
  }

  void _onOfflineSync() {
    if (isClosed || _wsId.isEmpty) {
      return;
    }
    unawaited(
      _fetch(replaceExisting: true).then<void>((_) {}, onError: (Object _) {}),
    );
  }

  @override
  Future<void> close() {
    _generation++;
    OfflineMutationQueue.instance.syncRevision.removeListener(_onOfflineSync);
    return super.close();
  }

  final FinanceRepository _repo;
  final CacheStore _store;
  final String? Function() _currentUserId;
  int _generation = 0;
  String? _loadedUserId;

  bool _isCurrent(int generation, String? userId, String wsId, String search) =>
      !isClosed &&
      generation == _generation &&
      _currentUserId() == userId &&
      _wsId == wsId &&
      state.search == search;

  CacheKey _requestKey(String wsId, String? userId, String search) => CacheKey(
    namespace: 'finance.transactions',
    userId: userId,
    workspaceId: wsId,
    locale: currentCacheLocaleTag(),
    params: {'search': search},
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
    _wsId = wsId;
    emit(
      hasVisibleData
          ? state.copyWith(
              search: '',
              status: TransactionListStatus.loading,
              clearCursor: true,
              clearError: true,
            )
          : const TransactionListState(status: TransactionListStatus.loading),
    );
    final cacheId = '${userId ?? 'anonymous'}::$wsId::';
    final cached = _cache[cacheId];
    final diskCached = await _store.read<TransactionListState>(
      key: _requestKey(wsId, userId, ''),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!_isCurrent(generation, userId, wsId, '')) {
      return;
    }
    final resolvedCached = cached?.state ?? diskCached.data;
    if (resolvedCached != null && (!forceRefresh || !hasVisibleData)) {
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      emit(resolvedCached);
      emit(
        resolvedCached.copyWith(
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

      final (workspaceCurrency, exchangeRates) = await (
        workspaceCurrencyFuture,
        exchangeRatesFuture,
      ).wait;
      if (!_isCurrent(generation, userId, wsId, '')) {
        return;
      }

      _loadedUserId = userId;
      emit(
        state.copyWith(
          workspaceCurrency: workspaceCurrency,
          exchangeRates: exchangeRates,
        ),
      );

      await _fetch(replaceExisting: true, generation: generation);
    } on Object catch (error) {
      if (!_isCurrent(generation, userId, wsId, '')) {
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
    await _fetch(replaceExisting: false);
  }

  /// Update the search query and reload from scratch.
  Future<void> setSearch(String query) async {
    if (isClosed || query == state.search) {
      return;
    }
    final generation = ++_generation;
    final userId = _currentUserId();
    final wsId = _wsId;
    if (_loadedUserId != userId) {
      emit(const TransactionListState());
    }
    emit(
      state.copyWith(
        search: query,
        status: TransactionListStatus.loading,
        transactions: [],
        hasMore: true,
        clearCursor: true,
        clearError: true,
      ),
    );
    final cached = _cache['${userId ?? 'anonymous'}::$wsId::$query'];
    final diskCached = await _store.read<TransactionListState>(
      key: _requestKey(wsId, userId, query),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!_isCurrent(generation, userId, wsId, query)) {
      return;
    }
    final resolvedCached = cached?.state ?? diskCached.data;
    if (resolvedCached != null) {
      emit(resolvedCached);
      emit(
        resolvedCached.copyWith(
          status: TransactionListStatus.loading,
          hasMore: true,
          clearCursor: true,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          search: query,
          status: TransactionListStatus.loading,
          transactions: [],
          hasMore: true,
          clearCursor: true,
          clearError: true,
        ),
      );
    }
    await _fetch(replaceExisting: true, generation: generation);
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
      emit(TransactionListState(search: search));
    }
    final requestState = state;
    final storeKey = _requestKey(wsId, userId, search);
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
        ),
      );

      if (!_isCurrent(requestGeneration, userId, wsId, search)) {
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

      _cache['${userId ?? 'anonymous'}::$wsId::$search'] =
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
      if (!_isCurrent(requestGeneration, userId, wsId, search)) {
        return;
      }
      _loadedWorkspaceId = wsId;
      _loadedUserId = userId;
      emit(nextState);
    } on Object catch (e) {
      if (!_isCurrent(requestGeneration, userId, wsId, search)) {
        return;
      }
      final visible = overlayPendingTransactions(
        _wsId,
        state.transactions,
        OfflineMutationQueue.instance.pending.value,
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
