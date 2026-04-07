import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/transaction_detail_sheet.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _FakeFinanceRepository extends FinanceRepository {
  @override
  Future<String> getWorkspaceDefaultCurrency(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    return 'USD';
  }

  @override
  Future<List<Wallet>> getWallets(String wsId) async {
    return const [Wallet(id: 'wallet_1', name: 'Main Wallet')];
  }

  @override
  Future<List<TransactionCategory>> getCategories(String wsId) async {
    return const [TransactionCategory(id: 'cat_1', name: 'Income')];
  }

  @override
  Future<List<FinanceTag>> getTags(String wsId) async {
    return const [FinanceTag(id: 'tag_1', name: 'Work')];
  }
}

void main() {
  group('showTransactionDetailSheet', () {
    testWidgets('renders detail content and allows opening edit dialog', (
      tester,
    ) async {
      var didSave = false;
      double? savedAmount;
      bool? savedReportOptIn;
      bool? savedIsAmountConfidential;
      bool? savedIsDescriptionConfidential;
      bool? savedIsCategoryConfidential;

      final transaction = Transaction(
        id: 'tx_1',
        amount: 120.5,
        description: 'Consulting payment',
        categoryId: 'cat_1',
        walletId: 'wallet_1',
        categoryName: 'Income',
        walletName: 'Main Wallet',
        walletCurrency: 'USD',
        takenAt: DateTime(2026, 2, 15, 9, 30),
        reportOptIn: true,
        isAmountConfidential: false,
        isDescriptionConfidential: false,
        isCategoryConfidential: false,
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
                      repository: _FakeFinanceRepository(),
                      onSave:
                          ({
                            required transactionId,
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
                            didSave = true;
                            savedAmount = amount;
                            savedReportOptIn = reportOptIn;
                            savedIsAmountConfidential = isAmountConfidential;
                            savedIsDescriptionConfidential =
                                isDescriptionConfidential;
                            savedIsCategoryConfidential =
                                isCategoryConfidential;
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

      expect(find.text('Transaction details'), findsAtLeastNWidgets(1));
      expect(find.text('Consulting payment'), findsOneWidget);
      expect(find.text('Income'), findsAtLeastNWidgets(1));
      expect(find.text('Main Wallet'), findsAtLeastNWidgets(1));

      await tester.tap(find.byIcon(Icons.edit_outlined).first);
      await tester.pumpAndSettle();

      expect(find.text('Edit transaction'), findsAtLeastNWidgets(1));
      expect(find.byKey(const ValueKey('money-key-1')), findsOneWidget);
      expect(find.byKey(const ValueKey('money-key-C')), findsOneWidget);
      expect(find.byKey(const ValueKey('money-key-Done')), findsOneWidget);
      expect(find.text('Description'), findsWidgets);
      expect(find.text('Taken at'), findsWidgets);

      await tester.tap(find.byKey(const ValueKey('money-key-C')));
      await tester.pumpAndSettle();
      final doneInkWellFinder = find.ancestor(
        of: find.byKey(const ValueKey('money-key-Done')),
        matching: find.byType(InkWell),
      );
      tester.widget<InkWell>(doneInkWellFinder).onTap?.call();
      await tester.pumpAndSettle();
      tester
          .widget<shad.PrimaryButton>(
            find.widgetWithText(shad.PrimaryButton, 'Save').last,
          )
          .onPressed
          ?.call();
      await tester.pumpAndSettle();

      expect(didSave, isFalse);
      expect(find.text('Edit transaction'), findsAtLeastNWidgets(1));

      await tester.tap(find.byKey(const ValueKey('money-source-surface')));
      await tester.pumpAndSettle();

      void pressMoneyKey(String key) {
        final inkWellFinder = find.ancestor(
          of: find.byKey(ValueKey('money-key-$key')),
          matching: find.byType(InkWell),
        );
        tester.widget<InkWell>(inkWellFinder).onTap?.call();
      }

      for (final key in ['4', '0', '+', '2', '.', '5']) {
        pressMoneyKey(key);
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('money-key-=')), findsOneWidget);
      final equalInkWellFinder = find.ancestor(
        of: find.byKey(const ValueKey('money-key-=')),
        matching: find.byType(InkWell),
      );
      tester.widget<InkWell>(equalInkWellFinder).onTap?.call();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('money-key-Done')), findsOneWidget);
      tester.widget<InkWell>(doneInkWellFinder).onTap?.call();
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Settings').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('settings-collapsed')));
      await tester.pumpAndSettle();

      var switches = tester
          .widgetList<shad.Switch>(find.byType(shad.Switch))
          .toList(growable: false);
      expect(switches, hasLength(4));
      expect(switches[0].value, isTrue);
      expect(switches[1].value, isFalse);
      expect(switches[2].value, isFalse);
      expect(switches[3].value, isFalse);

      for (var index = 0; index < 4; index++) {
        final switchFinder = find.byType(shad.Switch).at(index);
        await tester.ensureVisible(switchFinder);
        await tester.tap(switchFinder);
      }
      await tester.pumpAndSettle();

      switches = tester
          .widgetList<shad.Switch>(find.byType(shad.Switch))
          .toList(growable: false);
      expect(switches[0].value, isFalse);
      expect(switches[1].value, isTrue);
      expect(switches[2].value, isTrue);
      expect(switches[3].value, isTrue);

      tester
          .widget<shad.PrimaryButton>(
            find.widgetWithText(shad.PrimaryButton, 'Save').last,
          )
          .onPressed
          ?.call();
      await tester.pumpAndSettle();

      expect(didSave, isTrue);
      expect(savedAmount, -42.5);
      expect(savedReportOptIn, isFalse);
      expect(savedIsAmountConfidential, isTrue);
      expect(savedIsDescriptionConfidential, isTrue);
      expect(savedIsCategoryConfidential, isTrue);

      await tester.drainShadToastTimers();
    });

    testWidgets('quick tag updates return true when the sheet is dismissed', (
      tester,
    ) async {
      final resultCompleter = Completer<bool>();
      List<String>? savedTagIds;

      final transaction = Transaction(
        id: 'tx_1',
        amount: -120.5,
        description: 'Tagged expense',
        categoryId: 'cat_1',
        walletId: 'wallet_1',
        categoryName: 'Expense',
        walletName: 'Main Wallet',
        walletCurrency: 'USD',
        takenAt: DateTime(2026, 2, 15, 9, 30),
        reportOptIn: true,
      );

      await tester.pumpApp(
        Scaffold(
          body: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () {
                  final future = showTransactionDetailSheet(
                    context,
                    wsId: 'ws_1',
                    transaction: transaction,
                    repository: _FakeFinanceRepository(),
                    onSave:
                        ({
                          required transactionId,
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
                          savedTagIds = tagIds;
                          return transaction.copyWith(
                            tags: const [
                              TransactionTag(
                                id: 'tag_1',
                                name: 'Work',
                                color: '#3366ff',
                              ),
                            ],
                          );
                        },
                    onDelete: (_) async {},
                  );
                  unawaited(future.then(resultCompleter.complete));
                },
                child: const Text('Open details'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Open details'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Tags'));
      await tester.tap(find.text('Tags'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Work').first);
      await tester.tap(find.text('Work').first);
      await tester.pumpAndSettle();

      expect(savedTagIds, ['tag_1']);
      expect(find.text('Work'), findsWidgets);

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();

      expect(await resultCompleter.future, isTrue);
      await tester.drainShadToastTimers();
    });

    testWidgets(
      'create mode restores report defaults across transfer mode changes '
      'until settings are edited',
      (tester) async {
        await tester.pumpApp(
          Scaffold(
            body: Builder(
              builder: (context) {
                return ElevatedButton(
                  onPressed: () {
                    unawaited(
                      showCreateTransactionSheet(
                        context,
                        wsId: 'ws_1',
                        repository: _FakeFinanceRepository(),
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
                            }) async {},
                      ),
                    );
                  },
                  child: const Text('Open create'),
                );
              },
            ),
          ),
        );

        await tester.tap(find.text('Open create'));
        await tester.pumpAndSettle();

        Future<void> tapMode(String label) async {
          final finder = find.text(label).last;
          await tester.ensureVisible(finder);
          await tester.tap(finder);
          await tester.pumpAndSettle();
        }

        await tapMode('Transfer');
        await tester.ensureVisible(
          find.byKey(const ValueKey('settings-collapsed')),
        );
        await tester.tap(find.byKey(const ValueKey('settings-collapsed')));
        await tester.pumpAndSettle();

        var switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches, hasLength(1));
        expect(switches.first.value, isFalse);

        await tapMode('Basic');
        switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches.first.value, isTrue);

        await tapMode('Transfer');
        switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches.first.value, isFalse);

        final reportSwitchFinder = find.byType(shad.Switch).first;
        await tester.ensureVisible(reportSwitchFinder);
        await tester.tap(reportSwitchFinder);
        await tester.pumpAndSettle();
        switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches.first.value, isTrue);

        await tapMode('Basic');
        switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches.first.value, isTrue);

        await tapMode('Transfer');
        switches = tester
            .widgetList<shad.Switch>(find.byType(shad.Switch))
            .toList(growable: false);
        expect(switches.first.value, isTrue);
      },
    );
  });
}
