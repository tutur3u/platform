part of 'finance_cubit.dart';

enum FinanceStatus { initial, loading, loaded, error }

class FinanceState extends Equatable {
  const FinanceState({
    this.status = FinanceStatus.initial,
    this.wallets = const [],
    this.recentTransactions = const [],
    this.error,
  });

  final FinanceStatus status;
  final List<Wallet> wallets;
  final List<Transaction> recentTransactions;
  final String? error;

  /// Sum of all wallet balances (simple aggregation — same currency assumed).
  double get totalBalance =>
      wallets.fold(0, (sum, w) => sum + (w.balance ?? 0));

  FinanceState copyWith({
    FinanceStatus? status,
    List<Wallet>? wallets,
    List<Transaction>? recentTransactions,
    String? error,
    bool clearError = false,
  }) => FinanceState(
    status: status ?? this.status,
    wallets: wallets ?? this.wallets,
    recentTransactions: recentTransactions ?? this.recentTransactions,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    wallets,
    recentTransactions,
    error,
  ];
}
