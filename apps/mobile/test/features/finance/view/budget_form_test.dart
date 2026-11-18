import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/budgets_cubit.dart';
import 'package:mobile/features/finance/view/budget_form_page.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

class _BudgetRepository extends FinanceSceneRepository {
  FinanceBudget? created;
  String? workspace;

  @override
  Future<FinanceBudgetWrite> createBudget({
    required String wsId,
    required FinanceBudget budget,
  }) async {
    workspace = wsId;
    created = budget;
    return FinanceBudgetWrite.synced;
  }
}

void main() {
  test('parses a budget limit with the local separators', () {
    expect(parseBudgetAmount('1,234.50'), 1234.5);
    expect(parseBudgetAmount('1.234,50', decimalSeparator: ','), 1234.5);
    expect(parseBudgetAmount(''), isNull);
  });

  test('summary takes only active monthly budgets in workspace currency', () {
    final now = DateTime(2026, 11, 18);
    FinanceBudget budget(
      String id, {
      String? walletId,
      FinanceBudgetPeriod period = FinanceBudgetPeriod.monthly,
      DateTime? start,
      DateTime? end,
    }) => FinanceBudget(
      id: id,
      name: id,
      amount: 10,
      startDate: start ?? DateTime(2026, 11),
      endDate: end,
      period: period,
      walletId: walletId,
    );
    final state = BudgetsState(
      workspaceCurrency: 'VND',
      wallets: const [
        Wallet(id: 'vnd', name: 'Local', currency: 'VND'),
        Wallet(id: 'usd', name: 'Foreign', currency: 'USD'),
      ],
      budgets: [
        budget('workspace'),
        budget('local', walletId: 'vnd'),
        budget('foreign', walletId: 'usd'),
        budget('unknown', walletId: 'missing'),
        budget('yearly', walletId: 'vnd', period: FinanceBudgetPeriod.yearly),
        budget('ended', walletId: 'vnd', end: DateTime(2026, 11, 10)),
        budget('future', walletId: 'vnd', start: DateTime(2026, 11, 25)),
      ],
    );
    expect(state.activeMonthlyBudgets(now).map((budget) => budget.id), [
      'local',
    ]);
    expect(
      state
          .copyWith(wallets: [state.wallets.first])
          .activeMonthlyBudgets(now)
          .map((budget) => budget.id),
      ['workspace', 'local'],
    );
  });

  testWidgets('validates the limit and saves to the form workspace', (
    tester,
  ) async {
    final repo = _BudgetRepository();
    final cubit = BudgetsCubit(repository: repo, currentUserId: () => 'actor');
    addTearDown(cubit.close);
    await cubit.load('source-workspace');
    await tester.pumpThemedHome(
      BudgetFormPage(
        cubit: cubit,
        wsId: 'source-workspace',
        now: DateTime(2026, 11, 18),
      ),
    );
    const name = ValueKey('finance-budget-name');
    const amount = ValueKey('finance-budget-amount');
    const save = ValueKey('finance-form-save');
    await tester.tap(find.byKey(save));
    await tester.pumpAndSettle();
    expect(find.text('Enter a budget name'), findsOneWidget);
    expect(find.text('Enter a limit greater than zero'), findsOneWidget);
    expect(repo.created, isNull);

    await tester.enterText(
      find.descendant(of: find.byKey(name), matching: find.byType(TextField)),
      'Office',
    );
    final limit = find.descendant(
      of: find.byKey(amount),
      matching: find.byType(TextField),
    );
    expect(tester.widget<TextField>(limit).obscureText, isTrue);
    await tester.enterText(limit, '1,250.50');
    await tester.pump();
    expect(tester.widget<TextField>(limit).obscureText, isFalse);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pump();
    expect(tester.widget<TextField>(limit).obscureText, isTrue);
    await tester.tap(find.byKey(save));
    await tester.pumpAndSettle();
    expect(repo.workspace, 'source-workspace');
    expect(repo.created?.name, 'Office');
    expect(repo.created?.amount, 1250.5);
    expect(repo.created?.startDate, DateTime(2026, 11));
  });

  test('a form from another workspace fails before mutation', () async {
    final repo = _BudgetRepository();
    final cubit = BudgetsCubit(repository: repo, currentUserId: () => 'actor');
    addTearDown(cubit.close);
    await cubit.load('new-workspace');
    await expectLater(
      cubit.save(
        FinanceBudget(
          id: '',
          name: 'Office',
          amount: 10,
          startDate: DateTime(2026, 11),
        ),
        isNew: true,
        wsId: 'source-workspace',
      ),
      throwsStateError,
    );
    expect(repo.created, isNull);
  });
}
