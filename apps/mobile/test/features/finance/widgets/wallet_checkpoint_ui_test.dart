import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_checkpoint_ui.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('checkpoint totals panel masks amounts when hidden', (
    tester,
  ) async {
    var openedBatch = false;

    await tester.pumpApp(
      Scaffold(
        body: FinanceCheckpointTotalsPanel(
          totals: const [
            WalletCheckpointCurrencyTotal(
              currency: 'USD',
              actualTotal: 120,
              ledgerTotal: 100,
              varianceTotal: 20,
              checkpointCount: 1,
            ),
          ],
          showAmounts: false,
          onBatchCheck: () => openedBatch = true,
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Wallet checkpoints'), findsOneWidget);
    expect(find.text(financeMaskedAmountPlaceholder), findsWidgets);

    await tester.tap(find.text('All-wallet check'));
    await tester.pump();
    expect(openedBatch, isTrue);
  });

  testWidgets('wallet checkpoint detail sections render unresolved windows', (
    tester,
  ) async {
    var reconciled = false;

    await tester.pumpApp(
      Scaffold(
        body: SingleChildScrollView(
          child: WalletCheckpointDetailSections(
            wallet: const Wallet(id: 'wallet_1', name: 'Cash', currency: 'USD'),
            response: WalletCheckpointListResponse(
              latest: _checkpoint('checkpoint_2', actualBalance: 140),
              data: [_checkpoint('checkpoint_2', actualBalance: 140)],
              intervals: [
                WalletCheckpointInterval(
                  startCheckpointId: 'checkpoint_1',
                  endCheckpointId: 'checkpoint_2',
                  startCheckedAt: DateTime.utc(2026, 6, 16, 10),
                  endCheckedAt: DateTime.utc(2026, 6, 16, 11),
                  startActualBalance: 120,
                  endActualBalance: 140,
                  actualDelta: 20,
                  ledgerDelta: 35,
                  intervalVariance: -15,
                  transactionCount: 3,
                  isClean: false,
                ),
              ],
            ),
            showAmounts: true,
            canMutate: true,
            onCreate: () {},
            onEdit: (_) {},
            onDelete: (_) {},
            onReconcile: (_) => reconciled = true,
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Latest checkpoint'), findsOneWidget);
    expect(find.text('Reconciliation windows'), findsOneWidget);
    expect(find.text('Checkpoint timeline'), findsOneWidget);

    await tester.tap(find.text('Reconcile'));
    await tester.pump();
    expect(reconciled, isTrue);
  });
}

WalletCheckpoint _checkpoint(String id, {required double actualBalance}) {
  return WalletCheckpoint(
    id: id,
    walletId: 'wallet_1',
    actualBalance: actualBalance,
    ledgerBalance: 135,
    currentLedgerBalance: 135,
    originalVariance: actualBalance - 135,
    currentVariance: actualBalance - 135,
    currency: 'USD',
    checkedAt: DateTime.utc(2026, 6, 16, 11),
    createdAt: DateTime.utc(2026, 6, 16, 11, 1),
    updatedAt: DateTime.utc(2026, 6, 16, 11, 1),
  );
}
