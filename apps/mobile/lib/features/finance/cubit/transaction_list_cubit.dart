import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({
    required FinanceRepository financeRepository,
    TransactionListState? initialState,
  }) : _repo = financeRepository,
       super(initialState ?? const TransactionListState());

  final FinanceRepository _repo;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'finance:transactions';
  static final Map<String, _TransactionListCacheEntry> _cache = {};

  String _wsId = '';
  String? _loadedWorkspaceId;
  String get _cacheKey => '$_wsId::${state.search}';

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
    _wsId = wsId;
    final cacheId = '$wsId::';
    final cached = _cache[cacheId];
    final diskCached = await CacheStore.instance.read<TransactionListState>(
      key: _storeKey(wsId),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    final resolvedCached = cached?.state ?? diskCached.data;
    final hasResolvedCache = resolvedCached != null;

    if (!forceRefresh && hasResolvedCache) {
      _loadedWorkspaceId = wsId;
      emit(resolvedCached);
      if ((cached != null && isFinanceCacheFresh(cached.fetchedAt)) ||
          diskCached.isFresh) {
        return;
      }
      emit(
        resolvedCached.copyWith(
          status: TransactionListStatus.loading,
          hasMore: true,
          clearCursor: true,
          clearError: true,
        ),
      );
    } else if (_loadedWorkspaceId != wsId) {
      emit(
        state.copyWith(
          status: TransactionListStatus.loading,
          transactions: [],
          workspaceCurrency: 'USD',
          exchangeRates: const <ExchangeRate>[],
          hasMore: true,
          clearCursor: true,
          clearError: true,
          search: '',
        ),
      );
    } else if (state.transactions.isEmpty) {
      emit(
        state.copyWith(
          status: TransactionListStatus.loading,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: TransactionListStatus.loading,
          clearError: true,
        ),
      );
    }

    final workspaceCurrencyFuture = _repo
        .getWorkspaceDefaultCurrency(wsId)
        .catchError((_) => 'USD');
    final exchangeRatesFuture = _repo.getExchangeRates().catchError(
      (_) => <ExchangeRate>[],
    );

    final (workspaceCurrency, exchangeRates) = await (
      workspaceCurrencyFuture,
      exchangeRatesFuture,
    ).wait;

    emit(
      state.copyWith(
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
      ),
    );

    await _fetch(replaceExisting: true);
  }

  /// Load the next page (no-op if already loading or no more pages).
  Future<void> loadMore() async {
    if (state.status == TransactionListStatus.loading || !state.hasMore) {
      return;
    }
    emit(
      state.copyWith(
        status: TransactionListStatus.loading,
        clearError: true,
      ),
    );
    await _fetch(replaceExisting: false);
  }

  /// Update the search query and reload from scratch.
  Future<void> setSearch(String query) async {
    if (query == state.search) return;
    final cached = _cache['$_wsId::$query'];
    final diskCached = await CacheStore.instance.read<TransactionListState>(
      key: _storeKey(_wsId, search: query),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    final resolvedCached = cached?.state ?? diskCached.data;
    if (resolvedCached != null) {
      emit(resolvedCached);
      if ((cached != null && isFinanceCacheFresh(cached.fetchedAt)) ||
          diskCached.isFresh) {
        return;
      }
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
    await _fetch(replaceExisting: true);
  }

  Future<void> _fetch({required bool replaceExisting}) async {
    if (_wsId.isEmpty) {
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
      final result = await _repo.getTransactionsInfinite(
        wsId: _wsId,
        cursor: state.cursor,
        search: state.search.isEmpty ? null : state.search,
      );

      final allTransactions = replaceExisting
          ? result.data
          : [...state.transactions, ...result.data];
      final nextState = state.copyWith(
        status: TransactionListStatus.loaded,
        transactions: allTransactions,
        hasMore: result.hasMore,
        cursor: result.nextCursor,
        clearError: true,
      );

      _cache[_cacheKey] = _TransactionListCacheEntry(
        state: nextState,
        fetchedAt: DateTime.now(),
      );
      await CacheStore.instance.write(
        key: _storeKey(_wsId, search: state.search),
        policy: _cachePolicy,
        payload: _stateToCacheJson(nextState),
        tags: [_cacheTag, 'workspace:$_wsId', 'module:finance'],
      );
      _loadedWorkspaceId = _wsId;
      emit(nextState);
    } on Exception catch (e) {
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
    workspaceCurrency: json['workspaceCurrency'] as String? ?? 'USD',
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
