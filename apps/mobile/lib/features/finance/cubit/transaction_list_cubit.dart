import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

part 'transaction_list_state.dart';

class TransactionListCubit extends Cubit<TransactionListState> {
  TransactionListCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const TransactionListState());

  final FinanceRepository _repo;

  static const _pageSize = 20;

  List<String> _walletIds = [];

  /// Initialise with wallet IDs and load the first page.
  Future<void> load(List<String> walletIds) async {
    _walletIds = walletIds;
    emit(
      state.copyWith(
        status: TransactionListStatus.loading,
        transactions: [],
        hasMore: true,
        clearCursor: true,
        clearError: true,
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
    try {
      final rows = await _repo.getTransactionsPaginated(
        walletIds: _walletIds,
        cursor: state.cursor,
        search: state.search.isEmpty ? null : state.search,
      );

      final hasMore = rows.length > _pageSize;
      final page = hasMore ? rows.sublist(0, _pageSize) : rows;

      final allTransactions = [
        ...state.transactions,
        ...page,
      ];

      String? nextCursor;
      if (page.isNotEmpty) {
        final last = page.last;
        final takenIso = last.takenAt?.toUtc().toIso8601String();
        final createdIso = last.createdAt?.toUtc().toIso8601String();
        nextCursor = '${takenIso}_$createdIso';
      }

      emit(
        state.copyWith(
          status: TransactionListStatus.loaded,
          transactions: allTransactions,
          hasMore: hasMore,
          cursor: nextCursor,
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
