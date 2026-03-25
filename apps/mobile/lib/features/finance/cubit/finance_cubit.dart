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
  Future<void> loadFinanceData(String wsId) async {
    emit(state.copyWith(status: FinanceStatus.loading, clearError: true));

    try {
      final walletsFuture = _repo.getWallets(wsId);
      final recentTransactionsFuture = _repo.getTransactionsInfinite(
        wsId: wsId,
        limit: 10,
      );
      final workspaceCurrencyFuture = _repo
          .getWorkspaceDefaultCurrency(wsId)
          .catchError((_) => 'USD');
      final exchangeRatesFuture = _repo.getExchangeRates().catchError(
        (_) => <ExchangeRate>[],
      );

      final wallets = await walletsFuture;
      final recentTransactionsPage = await recentTransactionsFuture;
      final workspaceCurrency = await workspaceCurrencyFuture;
      final exchangeRates = await exchangeRatesFuture;

      emit(
        state.copyWith(
          status: FinanceStatus.loaded,
          wallets: wallets,
          recentTransactions: recentTransactionsPage.data,
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
