part of 'transaction_list_cubit.dart';

enum TransactionListStatus { initial, loading, loaded, error }

class TransactionListState extends Equatable {
  const TransactionListState({
    this.status = TransactionListStatus.initial,
    this.transactions = const [],
    this.workspaceCurrency = '',
    this.exchangeRates = const [],
    this.hasMore = true,
    this.cursor,
    this.search = '',
    this.query = const FinanceTransactionQuery(),
    this.walletId,
    this.wallets = const [],
    this.categories = const [],
    this.flow,
    this.error,
  });

  final TransactionListStatus status;
  final List<Transaction> transactions;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool hasMore;
  final String? cursor;
  final String search;

  /// Kind, category and date filters.
  final FinanceTransactionQuery query;

  /// Wallet filter; null lists every wallet.
  final String? walletId;

  /// Wallets and categories the filter pickers offer.
  final List<Wallet> wallets;
  final List<TransactionCategory> categories;

  /// Money in and out of the filtered transactions; null until it loads.
  final FinanceFlow? flow;
  final String? error;
  bool get hasWorkspaceCurrency => workspaceCurrency.trim().isNotEmpty;

  /// Whether we are fetching the next page (not initial load).
  bool get isLoadingMore =>
      status == TransactionListStatus.loading && transactions.isNotEmpty;

  bool get hasFilters => !query.isEmpty || walletId != null;

  /// Identity of the listed scope. Without filters it is the search text,
  /// which keeps unfiltered cache keys unchanged.
  String get scopeKey => hasFilters
      ? '$search\u0000${query.cacheKey}\u0000${walletId ?? ''}'
      : search;

  Wallet? get selectedWallet =>
      wallets.where((wallet) => wallet.id == walletId).firstOrNull;

  /// Currency of the flow totals: the filtered wallet's own currency, else
  /// the workspace currency.
  String get flowCurrency => selectedWallet?.currency ?? workspaceCurrency;

  TransactionListState copyWith({
    TransactionListStatus? status,
    List<Transaction>? transactions,
    String? workspaceCurrency,
    List<ExchangeRate>? exchangeRates,
    bool? hasMore,
    String? cursor,
    String? search,
    FinanceTransactionQuery? query,
    Object? walletId = _keepValue,
    List<Wallet>? wallets,
    List<TransactionCategory>? categories,
    FinanceFlow? flow,
    bool clearFlow = false,
    String? error,
    bool clearError = false,
    bool clearCursor = false,
  }) => TransactionListState(
    status: status ?? this.status,
    transactions: transactions ?? this.transactions,
    workspaceCurrency: workspaceCurrency ?? this.workspaceCurrency,
    exchangeRates: exchangeRates ?? this.exchangeRates,
    hasMore: hasMore ?? this.hasMore,
    cursor: clearCursor ? null : (cursor ?? this.cursor),
    search: search ?? this.search,
    query: query ?? this.query,
    walletId: walletId == _keepValue ? this.walletId : walletId as String?,
    wallets: wallets ?? this.wallets,
    categories: categories ?? this.categories,
    flow: clearFlow ? null : (flow ?? this.flow),
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    transactions,
    workspaceCurrency,
    exchangeRates,
    hasMore,
    cursor,
    search,
    query,
    walletId,
    wallets,
    categories,
    flow,
    error,
  ];
}

const _keepValue = Object();
