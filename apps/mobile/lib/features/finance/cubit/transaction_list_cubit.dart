import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const TransactionListState());

  final FinanceRepository _repo;

  String _wsId = '';

  /// Initialise with workspace ID and load the first page.
  Future<void> load(String wsId) async {
    _wsId = wsId;
    emit(
      state.copyWith(
        status: TransactionListStatus.loading,
        transactions: [],
        workspaceCurrency: 'USD',
        exchangeRates: const <ExchangeRate>[],
        hasMore: true,
        clearCursor: true,
        clearError: true,
      ),
    );

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

      emit(
        state.copyWith(
          status: TransactionListStatus.loaded,
          transactions: allTransactions,
          hasMore: result.hasMore,
          cursor: result.nextCursor,
          clearError: true,
        ),
      );
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
