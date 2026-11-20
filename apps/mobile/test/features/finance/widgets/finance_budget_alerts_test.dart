import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/recurring_transaction.dart';
import 'package:mobile/features/finance/widgets/finance_budget_alerts.dart';
import 'package:mobile/features/finance/widgets/recurring_upcoming.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

class _StatusRepository extends FinanceSceneRepository {
  _StatusRepository(this.rows);

  final List<FinanceBudgetStatus> rows;
  int reads = 0;

  @override
  Future<List<FinanceBudgetStatus>> getBudgetStatus(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    reads++;
    return rows;
  }
}

RecurringTransaction _rule(String id, DateTime next, {bool active = true}) =>
    RecurringTransaction(
      id: id,
      draft: (
        name: id,
        description: null,
        amount: -100,
        walletId: 'wallet-vnd',
        categoryId: null,
        frequency: RecurringFrequency.monthly,
        startDate: DateTime(2026),
        endDate: null,
      ),
      nextOccurrence: next,
      active: active,
    );

void main() {
  test('budget status parses the server flags', () {
    final status = FinanceBudgetStatus.fromJson(const {
      'budget_id': 'b',
      'budget_name': 'Food',
      'percentage_used': '112.4',
      'is_over_budget': true,
    });
    expect(status.percentageUsed, 112.4);
    expect(status.isOverBudget, isTrue);
    expect(status.isNearThreshold, isFalse);
  });

  test('upcoming keeps active runs within 30 days, soonest first', () {
    final now = DateTime(2026, 11, 20, 15);
    final upcoming = upcomingRecurring([
      _rule('later', DateTime(2026, 12, 20)),
      _rule('soon', DateTime(2026, 11, 22)),
      _rule('today', DateTime(2026, 11, 20)),
      _rule('past window', DateTime(2026, 12, 21)),
      _rule('paused', DateTime(2026, 11, 21), active: false),
      _rule('overdue', DateTime(2026, 11, 19)),
    ], now: now);
    expect(upcoming.map((rule) => rule.id), ['today', 'soon', 'later']);
  });

  group('alerts', () {
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
      );
      await DesignRender.loadFonts();
    });

    Future<void> pump(
      WidgetTester tester,
      _StatusRepository repository, {
      Brightness brightness = Brightness.light,
    }) async {
      DesignRender.setSize(tester, const Size(390, 260));
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FinanceBudgetAlerts(
              workspaceId: 'ws',
              repository: repository,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    for (final brightness in Brightness.values) {
      testWidgets('over budget leads in ${brightness.name}', (tester) async {
        await pump(
          tester,
          _StatusRepository(const [
            FinanceBudgetStatus(
              budgetId: 'near',
              name: 'Transport',
              percentageUsed: 86,
              isNearThreshold: true,
            ),
            FinanceBudgetStatus(
              budgetId: 'over',
              name: 'Groceries',
              percentageUsed: 112,
              isOverBudget: true,
            ),
          ]),
          brightness: brightness,
        );
        expect(find.text('1 budget is over its limit'), findsOneWidget);
        expect(find.text('View budgets'), findsOneWidget);
        await DesignRender.capture(
          tester,
          'finance-budget-alert-${brightness.name}',
        );
      });
    }

    testWidgets('near-limit budgets alone show a warning', (tester) async {
      await pump(
        tester,
        _StatusRepository(const [
          FinanceBudgetStatus(
            budgetId: 'near',
            name: 'Transport',
            percentageUsed: 86,
            isNearThreshold: true,
          ),
        ]),
      );
      expect(find.text('1 budget is close to its limit'), findsOneWidget);
    });

    testWidgets('healthy budgets render nothing', (tester) async {
      final repository = _StatusRepository(const []);
      await pump(tester, repository);
      expect(repository.reads, 1);
      expect(find.byKey(const ValueKey('finance-budget-alerts')), findsNothing);
    });
  });
}
