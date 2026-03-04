import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';

part 'finance_state.dart';

class FinanceCubit extends Cubit<FinanceState> {
  FinanceCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const FinanceState());

  final FinanceRepository _repo;

  /// Loads wallets and recent transactions for the workspace.
  ///
  /// Wallets are loaded first because `wallet_transactions` does not have a
  /// `ws_id` column — transactions are scoped through their wallet.
  Future<void> loadFinanceData(String wsId) async {
    emit(state.copyWith(status: FinanceStatus.loading, clearError: true));

    try {
      final walletsFuture = _repo.getWallets(wsId);
      final workspaceCurrencyFuture = _repo
          .getWorkspaceDefaultCurrency(wsId)
          .catchError((_) => 'USD');
      final exchangeRatesFuture = _repo.getExchangeRates().catchError(
        (_) => <ExchangeRate>[],
      );

      final wallets = await walletsFuture;
      final walletIds = wallets.map((w) => w.id).toList();
      final transactionsFuture = _repo.getTransactions(
        walletIds: walletIds,
        limit: 10,
      );

      final transactions = await transactionsFuture;
      final workspaceCurrency = await workspaceCurrencyFuture;
      final exchangeRates = await exchangeRatesFuture;

      emit(
        state.copyWith(
          status: FinanceStatus.loaded,
          wallets: wallets,
          recentTransactions: transactions,
          workspaceCurrency: workspaceCurrency,
          exchangeRates: exchangeRates,
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      emit(
        state.copyWith(status: FinanceStatus.error, error: e.toString()),
      );
    }
  }
}
