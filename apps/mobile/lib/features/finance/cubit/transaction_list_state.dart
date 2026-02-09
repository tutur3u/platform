part of 'transaction_list_cubit.dart';

enum TransactionListStatus { initial, loading, loaded, error }

class TransactionListState extends Equatable {
  const TransactionListState({
    this.status = TransactionListStatus.initial,
    this.transactions = const [],
    this.hasMore = true,
    this.cursor,
    this.search = '',
    this.error,
  });

  final TransactionListStatus status;
  final List<Transaction> transactions;
  final bool hasMore;
  final String? cursor;
  final String search;
  final String? error;

  /// Whether we are fetching the next page (not initial load).
  bool get isLoadingMore =>
      status == TransactionListStatus.loading && transactions.isNotEmpty;

  TransactionListState copyWith({
    TransactionListStatus? status,
    List<Transaction>? transactions,
    bool? hasMore,
    String? cursor,
    String? search,
    String? error,
    bool clearError = false,
    bool clearCursor = false,
  }) => TransactionListState(
    status: status ?? this.status,
    transactions: transactions ?? this.transactions,
    hasMore: hasMore ?? this.hasMore,
    cursor: clearCursor ? null : (cursor ?? this.cursor),
    search: search ?? this.search,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    transactions,
    hasMore,
    cursor,
    search,
    error,
  ];
}
