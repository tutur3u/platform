import 'dart:async';

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
        when(() => repository.getWallets('ws_1')).thenAnswer(
          (_) async => const [
            Wallet(id: 'wallet_1', name: 'Main wallet', currency: 'USD'),
          ],
        );
        when(
          () => repository.getTransactionsInfinite(wsId: 'ws_1', limit: 10),
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
        when(() => repository.getExchangeRates()).thenAnswer(
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
          workspaceCurrency: 'USD',
        ),
      ],
      verify: (_) {
        verify(() => repository.getWallets('ws_1')).called(1);
        verify(() => repository.getWorkspaceDefaultCurrency('ws_1')).called(1);
        verify(
          () => repository.getTransactionsInfinite(wsId: 'ws_1', limit: 10),
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

    test('keeps finance visible during a forced background refresh', () async {
      final pendingWallets = Completer<List<Wallet>>();
      var calls = 0;
      const wallets = [Wallet(id: 'wallet_2', name: 'Main', currency: 'USD')];
      when(() => repository.getWallets('ws_refresh')).thenAnswer((_) {
        calls++;
        return calls == 1 ? Future.value(wallets) : pendingWallets.future;
      });
      when(
        () => repository.getTransactionsInfinite(wsId: 'ws_refresh', limit: 10),
      ).thenAnswer(
        (_) async =>
            const InfiniteTransactionResponse(data: [], hasMore: false),
      );
      when(
        () => repository.getWorkspaceDefaultCurrency('ws_refresh'),
      ).thenAnswer((_) async => 'USD');
      when(
        () => repository.getExchangeRates(),
      ).thenAnswer((_) async => const []);

      final cubit = FinanceCubit(financeRepository: repository);
      addTearDown(cubit.close);
      await cubit.loadFinanceData('ws_refresh');

      final refresh = cubit.loadFinanceData('ws_refresh', forceRefresh: true);
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.status, FinanceStatus.loaded);
      expect(cubit.state.isRefreshing, isTrue);
      expect(cubit.state.wallets, wallets);

      pendingWallets.complete(wallets);
      await refresh;
      expect(cubit.state.isRefreshing, isFalse);
    });

    test('shows a disk snapshot for a cold forced refresh', () async {
      const wsId = 'ws_cold_force';
      const wallets = [
        Wallet(id: 'wallet_cold', name: 'Saved', currency: 'USD'),
      ];
      final pendingWallets = Completer<List<Wallet>>();
      var calls = 0;
      when(() => repository.getWallets(wsId)).thenAnswer((_) {
        calls++;
        return calls == 1 ? Future.value(wallets) : pendingWallets.future;
      });
      when(
        () => repository.getTransactionsInfinite(wsId: wsId, limit: 10),
      ).thenAnswer(
        (_) async =>
            const InfiniteTransactionResponse(data: [], hasMore: false),
      );
      when(
        () => repository.getWorkspaceDefaultCurrency(wsId),
      ).thenAnswer((_) async => 'USD');
      when(
        () => repository.getExchangeRates(),
      ).thenAnswer((_) async => const []);

      final first = FinanceCubit(financeRepository: repository);
      await first.loadFinanceData(wsId);
      await first.close();
      FinanceCubit.clearWorkspaceCache(wsId);

      final cold = FinanceCubit(financeRepository: repository);
      addTearDown(cold.close);
      final refresh = cold.loadFinanceData(wsId, forceRefresh: true);
      await Future<void>.delayed(Duration.zero);
      expect(cold.state.status, FinanceStatus.loaded);
      expect(cold.state.wallets, wallets);
      expect(cold.state.isRefreshing, isTrue);

      pendingWallets.complete(wallets);
      await refresh;
    });
  });
}
