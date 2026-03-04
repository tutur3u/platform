part of 'finance_cubit.dart';

enum FinanceStatus { initial, loading, loaded, error }

class FinanceState extends Equatable {
  const FinanceState({
    this.status = FinanceStatus.initial,
    this.wallets = const [],
    this.recentTransactions = const [],
    this.workspaceCurrency = 'USD',
    this.exchangeRates = const [],
    this.error,
  });

  final FinanceStatus status;
  final List<Wallet> wallets;
  final List<Transaction> recentTransactions;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final String? error;

  double get totalBalance {
    return wallets.fold(0, (sum, wallet) {
      final balance = wallet.balance ?? 0;
      final walletCurrency = (wallet.currency ?? workspaceCurrency)
          .toUpperCase();
      final targetCurrency = workspaceCurrency.toUpperCase();

      if (walletCurrency == targetCurrency) {
        return sum + balance;
      }

      final converted = convertCurrency(
        balance,
        walletCurrency,
        workspaceCurrency,
        exchangeRates,
      );
      if (converted == null) {
        return sum;
      }
      return sum + converted;
    });
  }

  bool get hasCrossCurrencyWallets {
    final target = workspaceCurrency.toUpperCase();
    return wallets.any((wallet) {
      final walletCurrency = (wallet.currency ?? target).toUpperCase();
      return walletCurrency != target;
    });
  }

  FinanceState copyWith({
    FinanceStatus? status,
    List<Wallet>? wallets,
    List<Transaction>? recentTransactions,
    String? workspaceCurrency,
    List<ExchangeRate>? exchangeRates,
    String? error,
    bool clearError = false,
  }) => FinanceState(
    status: status ?? this.status,
    wallets: wallets ?? this.wallets,
    recentTransactions: recentTransactions ?? this.recentTransactions,
    workspaceCurrency: workspaceCurrency ?? this.workspaceCurrency,
    exchangeRates: exchangeRates ?? this.exchangeRates,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    wallets,
    recentTransactions,
    workspaceCurrency,
    exchangeRates,
    error,
  ];
}
