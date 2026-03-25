import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const TransactionListState());

  final FinanceRepository _repo;
  static final Map<String, _TransactionListCacheEntry> _cache = {};

  String _wsId = '';
  String? _loadedWorkspaceId;
  String get _cacheKey => '$_wsId::${state.search}';

  /// Initialise with workspace ID and load the first page.
  Future<void> load(String wsId, {bool forceRefresh = false}) async {
    _wsId = wsId;
    final cached = _cache['$wsId::'];
    if (!forceRefresh && cached != null) {
      _loadedWorkspaceId = wsId;
      emit(cached.state);
      if (isFinanceCacheFresh(cached.fetchedAt)) {
        return;
      }
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

    await _fetch();
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
    await _fetch();
  }

  /// Update the search query and reload from scratch.
  Future<void> setSearch(String query) async {
    if (query == state.search) return;
    final cached = _cache['$_wsId::$query'];
    if (cached != null) {
      emit(cached.state);
      if (isFinanceCacheFresh(cached.fetchedAt)) {
        return;
      }
      emit(cached.state.copyWith(status: TransactionListStatus.loading));
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
    await _fetch();
  }

  Future<void> _fetch() async {
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

      final allTransactions = [
        ...state.transactions,
        ...result.data,
      ];

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
      _loadedWorkspaceId = _wsId;
      emit(nextState);
    } on Exception catch (e) {
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
