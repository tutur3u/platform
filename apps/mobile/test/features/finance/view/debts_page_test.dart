import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/features/finance/utils/debt_filters.dart';
import 'package:mobile/features/finance/view/debts_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import 'finance_debt_fixtures.dart';
import 'finance_scenes.dart';

final _now = DateTime(2026, 11, 20);

void main() {
  test('debts round-trip the API shape and flag overdue entries', () {
    final debt = DebtLoan.fromJson(const {
      'id': 'd1',
      'name': 'Car loan',
      'type': 'loan',
      'principal_amount': '1200.5',
      'currency': 'USD',
      'start_date': '2026-01-15',
      'due_date': '2026-11-19',
      'status': 'active',
      'interest_rate': 4.5,
      'interest_type': 'compound',
      'total_paid': 200,
      'remaining_balance': 1000.5,
      'progress_percentage': 16.7,
    });
    expect(debt.type, DebtLoanType.loan);
    expect(debt.principalAmount, 1200.5);
    expect(debt.interestType, DebtInterestType.compound);
    expect(debt.isOverdue(_now), isTrue);
    expect(debt.toPayload(), containsPair('start_date', '2026-01-15'));
    expect(debt.toPayload(), containsPair('due_date', '2026-11-19'));
    expect(
      DebtLoan.fromJson(const {
        'id': 'd2',
        'principal_amount': 10,
      }).remainingBalance,
      10,
    );
  });

  test('filters by type and status with overdue entries first', () {
    List<String> names(DebtLoanType? type, DebtLoanStatus? status) =>
        visibleDebts(
          financeSceneDebts,
          type: type,
          status: status,
          now: _now,
        ).map((debt) => debt.name).toList();
    expect(names(null, DebtLoanStatus.active), [
      'Rent',
      'Car loan',
      'Lent to Lan',
    ]);
    expect(names(DebtLoanType.loan, null), ['Lent to Lan']);
    expect(names(null, null).last, 'Old card');
  });

  group('page', () {
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
      );
      await seedFinanceSceneCache();
      await DesignRender.loadFonts();
    });

    Future<FinanceSceneDebtsRepository> pump(
      WidgetTester tester, {
      Brightness brightness = Brightness.light,
      List<DebtLoan>? rows,
    }) async {
      final debts = FinanceSceneDebtsRepository(rows);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: FinanceScreenScene(
            scene: FinanceScene.debts,
            showAmounts: true,
            page: DebtsPage(
              repository: debts,
              financeRepository: FinanceSceneRepository(),
              now: _now,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return debts;
    }

    for (final brightness in Brightness.values) {
      testWidgets(
        'renders the net position and filters in ${brightness.name}',
        (tester) async {
          await pump(tester, brightness: brightness);
          expect(find.text('Net position'), findsOneWidget);
          expect(find.text('Old card'), findsNothing, reason: 'Active only');
          expect(find.text('Overdue'), findsOneWidget);
          await DesignRender.capture(
            tester,
            'finance-debts-${brightness.name}',
          );
          await tester.tap(find.text('Car loan'));
          await tester.pumpAndSettle();
          expect(find.text('Remaining'), findsOneWidget);
          await DesignRender.capture(
            tester,
            'finance-debt-detail-${brightness.name}',
          );
        },
      );
    }

    testWidgets('loans pill narrows the list', (tester) async {
      await pump(tester);
      await tester.ensureVisible(find.text('Loans'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Loans'));
      await tester.pumpAndSettle();
      expect(find.text('Lent to Lan'), findsOneWidget);
      expect(find.text('Car loan'), findsNothing);
    });

    testWidgets('marks a debt paid and deletes after confirming', (
      tester,
    ) async {
      final debts = await pump(tester);
      await tester.tap(find.text('Rent'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('debt-mark-paid')));
      await tester.pumpAndSettle();
      expect(debts.calls, ['status:Rent:paid']);

      await tester.tap(find.text('Car loan'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('debt-delete')));
      await tester.pumpAndSettle();
      expect(find.text('Delete Car loan?'), findsOneWidget);
      await tester.tap(find.text('Delete').last);
      await tester.pumpAndSettle();
      expect(debts.calls.last, 'delete:Car loan');
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('creates a loan from the empty state with validation', (
      tester,
    ) async {
      final debts = await pump(tester, rows: const []);
      await tester.tap(find.text('New debt or loan').last);
      await tester.pumpAndSettle();
      await DesignRender.capture(tester, 'finance-debt-form-light');
      await tester.tap(find.byKey(const ValueKey('debt-save')));
      await tester.pumpAndSettle();
      expect(find.text('Enter a name'), findsOneWidget);
      expect(find.text('Enter an amount above zero'), findsOneWidget);
      await tester.tap(find.text('Loan'));
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('debt-name')),
          matching: find.byType(EditableText),
        ),
        'Lent to Lan',
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('debt-amount')),
          matching: find.byType(EditableText),
        ),
        '500000',
      );
      await tester.tap(find.byKey(const ValueKey('debt-save')));
      await tester.pumpAndSettle();
      expect(debts.calls, ['create:Lent to Lan:loan:500000.0']);
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
