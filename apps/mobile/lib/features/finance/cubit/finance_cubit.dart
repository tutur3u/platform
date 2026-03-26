import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/finance_cache.dart';

part 'finance_state.dart';

class FinanceCubit extends Cubit<FinanceState> {
  FinanceCubit({required FinanceRepository financeRepository})
    : _repo = financeRepository,
      super(const FinanceState());

  final FinanceRepository _repo;
  static final Map<String, _FinanceCacheEntry> _cache = {};
  String? _loadedWorkspaceId;

  /// Loads wallets and recent transactions for the workspace.
  Future<void> loadFinanceData(String wsId, {bool forceRefresh = false}) async {
    final cached = _cache[wsId];
    final hasVisibleData = _loadedWorkspaceId == wsId;

    if (!forceRefresh && cached != null) {
      _loadedWorkspaceId = wsId;
      emit(cached.state);
      if (isFinanceCacheFresh(cached.fetchedAt)) {
        return;
      }
    } else if (!hasVisibleData) {
      emit(state.copyWith(status: FinanceStatus.loading, clearError: true));
    }

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

      final nextState = state.copyWith(
        status: FinanceStatus.loaded,
        wallets: wallets,
        recentTransactions: recentTransactionsPage.data,
        workspaceCurrency: workspaceCurrency,
        exchangeRates: exchangeRates,
        clearError: true,
      );

      _cache[wsId] = _FinanceCacheEntry(
        state: nextState,
        fetchedAt: DateTime.now(),
      );
      _loadedWorkspaceId = wsId;
      emit(nextState);
    } on Exception catch (e) {
      if (cached != null || hasVisibleData) {
        emit(
          (cached?.state ?? state).copyWith(
            status: FinanceStatus.loaded,
            clearError: true,
          ),
        );
        return;
      }
      emit(
        state.copyWith(status: FinanceStatus.error, error: e.toString()),
      );
    }
  }
}

class _FinanceCacheEntry {
  const _FinanceCacheEntry({
    required this.state,
    required this.fetchedAt,
  });

  final FinanceState state;
  final DateTime fetchedAt;
}
