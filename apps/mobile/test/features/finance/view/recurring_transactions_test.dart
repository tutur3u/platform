import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/recurring_transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/recurring_transactions_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    await seedFinanceSceneCache();
  });

  testWidgets('a signed recurring rule can be saved from the Finance sheet', (
    tester,
  ) async {
    final repo = _RecurringRepository();
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpThemedHome(
      FinanceScreenScene(
        scene: FinanceScene.overview,
        page: RepositoryProvider<FinanceRepository>.value(
          value: repo,
          child: Builder(
            builder: (context) => Center(
              child: TextButton(
                onPressed: () => unawaited(
                  openRecurringTransactionsSheet(context, currency: 'VND'),
                ),
                child: const Text('Open recurring rules'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open recurring rules'));
    await tester.pumpAndSettle();
    expect(find.text('No recurring transactions'), findsOneWidget);
    await tester.tap(find.text('New recurring transaction'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Internet');
    await tester.enterText(find.byType(TextField).at(1), '-225,50');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    final saved = repo.saved;
    expect(saved?.name, 'Internet');
    expect(saved?.amount, -225.5);
    expect(saved?.frequency, RecurringFrequency.monthly);
    expect(find.text('Internet'), findsWidgets);
    expect(find.text('Next 30 days'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _RecurringRepository extends FinanceSceneRepository {
  RecurringTransactionDraft? saved;

  @override
  Future<List<RecurringTransaction>> getRecurringTransactions(
    String wsId, {
    bool forceRefresh = false,
  }) async => [
    if (saved case final draft?)
      RecurringTransaction(
        id: 'scheduled',
        draft: draft,
        nextOccurrence: draft.startDate,
        active: true,
      ),
  ];

  @override
  Future<void> saveRecurringTransaction({
    required String workspace,
    required RecurringTransactionDraft draft,
    String? id,
  }) async {
    saved = draft;
  }
}
