import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

typedef _TransactionDraft = ({
  double amount,
  String? walletId,
  String? categoryId,
  bool? reportOptIn,
});

typedef _TransferDraft = ({
  String from,
  String to,
  double amount,
  bool? reportOptIn,
});

class _FormRepository extends FinanceSceneRepository {
  _TransferDraft? transfer;

  @override
  Future<String?> createTransfer({
    required String wsId,
    required String originWalletId,
    required String destinationWalletId,
    required double amount,
    DateTime? takenAt,
    String? description,
    double? destinationAmount,
    bool? reportOptIn,
    List<String>? tagIds,
  }) async {
    transfer = (
      from: originWalletId,
      to: destinationWalletId,
      amount: amount,
      reportOptIn: reportOptIn,
    );
    return 'new-transfer';
  }
}

Future<void> _openForm(
  WidgetTester tester, {
  required ValueChanged<_TransactionDraft> onSave,
  _FormRepository? repository,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final finance = repository ?? _FormRepository();
  await tester.pumpApp(
    Builder(
      builder: (context) => Center(
        child: ElevatedButton(
          onPressed: () => unawaited(
            showCreateTransactionSheet(
              context,
              wsId: 'workspace',
              repository: finance,
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
                    onSave((
                      amount: amount,
                      walletId: walletId,
                      categoryId: categoryId,
                      reportOptIn: reportOptIn,
                    ));
                    return 'new-transaction';
                  },
            ),
          ),
          child: const Text('Open form'),
        ),
      ),
    ),
  );
  await _tap(tester, find.text('Open form'));
}

Finder _key(String name) => find.byKey(ValueKey('money-key-$name'));

Future<void> _tap(WidgetTester tester, Finder control) async {
  await tester.tap(control);
  await tester.pumpAndSettle();
}

Future<void> _enterAmount(WidgetTester tester) async {
  await _tap(tester, find.byKey(const ValueKey('money-source-surface')));
  await _tap(tester, _key('2'));
  await _tap(tester, _key('000'));
  expect(find.text('2,000'), findsOneWidget);
  await _tap(tester, _key('Done'));
}

void main() {
  testWidgets('the keypad opens on create and dismisses on scroll', (
    tester,
  ) async {
    await _openForm(tester, onSave: (_) => fail('Unexpected save'));
    expect(_key('Done'), findsOneWidget);

    await tester.drag(
      find.byKey(const ValueKey('money-source-surface')),
      const Offset(0, -80),
    );
    await tester.pumpAndSettle();
    expect(_key('Done'), findsNothing);
  });

  testWidgets('Expense saves a negative amount', (tester) async {
    _TransactionDraft? saved;
    await _openForm(tester, onSave: (draft) => saved = draft);
    await _tap(tester, _key('Done'));
    await _tap(tester, find.text('Groceries'));
    await _enterAmount(tester);
    await _tap(tester, find.text('Save'));

    expect(saved, (
      amount: -2000.0,
      walletId: 'wallet-vnd',
      categoryId: 'food',
      reportOptIn: true,
    ));
    expect(find.text('Open form'), findsOneWidget);
  });

  testWidgets('Income restores its report default after Transfer', (
    tester,
  ) async {
    _TransactionDraft? saved;
    await _openForm(tester, onSave: (draft) => saved = draft);
    await _tap(tester, find.text('Transfer'));
    expect(find.text('Groceries'), findsNothing);
    expect(find.text('Destination wallet'), findsOneWidget);
    await _tap(tester, find.text('Income'));
    await _tap(tester, find.text('Salary'));
    await _enterAmount(tester);
    await _tap(tester, find.text('Save'));

    expect(saved, (
      amount: 2000.0,
      walletId: 'wallet-vnd',
      categoryId: 'salary',
      reportOptIn: true,
    ));
    expect(find.text('Open form'), findsOneWidget);
  });

  testWidgets('Transfer saves the selected wallets and positive amount', (
    tester,
  ) async {
    final repository = _FormRepository();
    await _openForm(
      tester,
      repository: repository,
      onSave: (_) => fail('Transfer sent through transaction creation'),
    );
    await _tap(tester, find.text('Transfer'));
    await _tap(tester, find.text('Destination wallet'));
    await _tap(tester, find.text('Credit'));
    await _enterAmount(tester);
    await _tap(tester, find.text('Save'));

    expect(repository.transfer, (
      from: 'wallet-vnd',
      to: 'credit-vnd',
      amount: 2000.0,
      reportOptIn: false,
    ));
    expect(find.text('Open form'), findsOneWidget);
  });

  testWidgets('validation shows the missing category, amount and wallet', (
    tester,
  ) async {
    final repository = _FormRepository();
    await _openForm(
      tester,
      repository: repository,
      onSave: (_) => fail('Invalid transaction submitted'),
    );

    await _tap(tester, find.text('Save'));
    expect(find.text('Choose a wallet and category first'), findsOneWidget);
    await tester.drainShadToastTimers();
    await _tap(tester, find.text('Groceries'));
    await _tap(tester, find.text('Save'));
    expect(find.text('Enter a valid amount'), findsOneWidget);
    await tester.drainShadToastTimers();
    await _tap(tester, find.text('Transfer'));
    await _tap(tester, find.text('Save'));
    expect(
      find.text('Choose source and destination wallets first'),
      findsOneWidget,
    );

    expect(repository.transfer, isNull);
    expect(find.text('New transaction'), findsOneWidget);
    await tester.drainShadToastTimers();
  });
}
