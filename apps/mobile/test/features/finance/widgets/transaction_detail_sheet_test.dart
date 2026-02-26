import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

import '../../../helpers/helpers.dart';

void main() {
  group('showTransactionDetailSheet', () {
    testWidgets('renders detail content and allows opening edit dialog', (
      tester,
    ) async {
      final transaction = Transaction(
        id: 'tx_1',
        amount: 120.5,
        description: 'Consulting payment',
        categoryName: 'Income',
        walletName: 'Main Wallet',
        walletCurrency: 'USD',
        takenAt: DateTime(2026, 2, 15, 9, 30),
      );

      await tester.pumpApp(
        Scaffold(
          body: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () {
                  unawaited(
                    showTransactionDetailSheet(
                      context,
                      wsId: 'ws_1',
                      transaction: transaction,
                      onSave:
                          ({
                            required transactionId,
                            required amount,
                            description,
                            takenAt,
                            walletId,
                            categoryId,
                            reportOptIn,
                            isAmountConfidential,
                            isDescriptionConfidential,
                            isCategoryConfidential,
                          }) async {
                            return transaction;
                          },
                      onDelete: (_) async {},
                    ),
                  );
                },
                child: const Text('Open details'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Open details'));
      await tester.pumpAndSettle();

      expect(find.text('Transaction details'), findsOneWidget);
      expect(find.text('Consulting payment'), findsOneWidget);
      expect(find.text('Income'), findsOneWidget);
      expect(find.text('Main Wallet'), findsOneWidget);

      await tester.tap(find.text('Edit transaction'));
      await tester.pumpAndSettle();

      expect(find.text('Edit transaction'), findsAtLeastNWidgets(1));
      expect(find.text('Amount'), findsWidgets);
      expect(find.text('Description'), findsWidgets);
      expect(find.text('Taken at'), findsWidgets);
    });
  });
}
