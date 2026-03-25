import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockFinanceRepository extends Mock implements FinanceRepository {}

void main() {
  group('FinanceCubit', () {
    late _MockFinanceRepository repository;

    setUp(() {
      repository = _MockFinanceRepository();
    });

    blocTest<FinanceCubit, FinanceState>(
      'loads recent transactions through the API-backed infinite endpoint',
      build: () {
        when(
          () => repository.getWallets('ws_1'),
        ).thenAnswer(
          (_) async => const [
            Wallet(id: 'wallet_1', name: 'Main wallet', currency: 'USD'),
          ],
        );
        when(
          () => repository.getTransactionsInfinite(
            wsId: 'ws_1',
            limit: 10,
          ),
        ).thenAnswer(
          (_) async => const InfiniteTransactionResponse(
            data: [
              Transaction(
                id: 'tx_1',
                amount: 42,
                description: 'Lunch',
                walletId: 'wallet_1',
              ),
            ],
            hasMore: false,
          ),
        );
        when(
          () => repository.getWorkspaceDefaultCurrency('ws_1'),
        ).thenAnswer((_) async => 'USD');
        when(
          () => repository.getExchangeRates(),
        ).thenAnswer(
          (_) async => const [
            ExchangeRate(
              baseCurrency: 'USD',
              targetCurrency: 'EUR',
              rate: 0.92,
              date: '2026-03-25',
            ),
          ],
        );

        return FinanceCubit(financeRepository: repository);
      },
      act: (cubit) => cubit.loadFinanceData('ws_1'),
      expect: () => [
        const FinanceState(status: FinanceStatus.loading),
        const FinanceState(
          status: FinanceStatus.loaded,
          wallets: [
            Wallet(id: 'wallet_1', name: 'Main wallet', currency: 'USD'),
          ],
          recentTransactions: [
            Transaction(
              id: 'tx_1',
              amount: 42,
              description: 'Lunch',
              walletId: 'wallet_1',
            ),
          ],
          exchangeRates: [
            ExchangeRate(
              baseCurrency: 'USD',
              targetCurrency: 'EUR',
              rate: 0.92,
              date: '2026-03-25',
            ),
          ],
        ),
      ],
      verify: (_) {
        verify(() => repository.getWallets('ws_1')).called(1);
        verify(
          () => repository.getTransactionsInfinite(
            wsId: 'ws_1',
            limit: 10,
          ),
        ).called(1);
        verifyNever(
          () => repository.getTransactions(
            walletIds: any(named: 'walletIds'),
            limit: any(named: 'limit'),
            offset: any(named: 'offset'),
          ),
        );
      },
    );
  });
}
