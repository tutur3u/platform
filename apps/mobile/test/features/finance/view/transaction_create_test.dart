import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

void main() {
  testWidgets(
    'create mode chooses the category sign and saves the same draft',
    (tester) async {
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      ({double amount, String? walletId, String? categoryId})? saved;
      await tester.pumpApp(
        Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => unawaited(
                showCreateTransactionSheet(
                  context,
                  wsId: 'workspace',
                  repository: FinanceSceneRepository(),
                  initialWalletId: 'wallet-vnd',
                  onCreate:
                      ({
                        required amount,
                        description,
                        takenAt,
                        walletId,
                        categoryId,
                        tagIds,
                        reportOptIn,
                        isAmountConfidential,
                        isDescriptionConfidential,
                        isCategoryConfidential,
                      }) async {
                        saved = (
                          amount: amount,
                          walletId: walletId,
                          categoryId: categoryId,
                        );
                        return 'new-transaction';
                      },
                ),
              ),
              child: const Text('Open form'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open form'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Groceries'));
      await tester.tap(find.text('Transfer'));
      await tester.pumpAndSettle();
      expect(find.text('Groceries'), findsNothing);
      expect(find.text('Destination wallet'), findsOneWidget);
      await tester.tap(find.text('Income'));
      await tester.pumpAndSettle();
      expect(find.text('Salary'), findsOneWidget);
      await tester.tap(find.text('Salary'));
      await tester.tap(find.byKey(const ValueKey('money-source-surface')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('money-key-2')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('money-key-000')));
      await tester.pumpAndSettle();
      expect(find.text('2,000'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('money-key-Done')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(saved, (
        amount: 2000.0,
        walletId: 'wallet-vnd',
        categoryId: 'salary',
      ));
      expect(find.text('Open form'), findsOneWidget);
    },
  );
}
