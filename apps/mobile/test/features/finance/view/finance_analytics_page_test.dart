import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_origins.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/finance/finance_analytics.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/finance/view/finance_analytics_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import 'finance_analytics_fixtures.dart';
import 'finance_scenes.dart';

void main() {
  test('parses chart summaries and sums the category breakdown', () {
    final summary = FinanceIncomeExpenseSummary.fromJson(const {
      'data': [
        {'period': '2026-11', 'total_income': '120', 'total_expense': -45},
        {'period': 'not a date', 'total_income': 1},
      ],
      'total_income': 120,
      'total_expense': 45,
      'opening_balance': 1000,
      'closing_balance': 1075,
    });
    expect(summary.points.single.date, DateTime(2026, 11));
    expect(summary.points.single.expense, 45);
    expect(summary.closingBalance, 1075);

    final totals = FinanceCategoryTotal.fromBreakdown(const [
      {'category_id': 'a', 'category_name': 'Food', 'total': 10},
      {'category_id': 'b', 'category_name': 'Rent', 'total': 30},
      {'category_id': 'a', 'category_name': 'Food', 'total': 25},
      {'category_id': 'c', 'category_name': 'Idle', 'total': 0},
    ]);
    expect(totals.map((total) => (total.id, total.total)), [
      ('a', 35.0),
      ('b', 30.0),
    ]);
  });

  test('workspace chart routes resolve to the Finance origin', () {
    final origins = ApiOrigins.forFlavor(AppFlavor.production);
    for (final path in [
      '/api/workspaces/ws/finance/charts/income-expense-summary',
      '/api/workspaces/ws/transactions/category-breakdown?type=expense',
    ]) {
      expect(origins.ownerForPath(path), ApiOrigin.finance, reason: path);
    }
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

    Future<FinanceSceneAnalyticsRepository> pump(
      WidgetTester tester, {
      Brightness brightness = Brightness.light,
      Exception? failure,
    }) async {
      final repository = FinanceSceneAnalyticsRepository(failure: failure);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: FinanceScreenScene(
            scene: FinanceScene.analytics,
            showAmounts: true,
            page: FinanceAnalyticsPage(
              repository: repository,
              financeRepository: FinanceSceneRepository(),
              now: financeSceneDate,
              timezone: 'Asia/Ho_Chi_Minh',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return repository;
    }

    for (final brightness in Brightness.values) {
      testWidgets('renders the month in ${brightness.name}', (tester) async {
        final repository = await pump(tester, brightness: brightness);
        expect(find.text('Closing balance'), findsOneWidget);
        expect(find.text('Balance trend'), findsOneWidget);
        expect(repository.requests, [
          'flow:11-30:false',
          'categories:expense:Asia/Ho_Chi_Minh',
        ]);
        await DesignRender.capture(
          tester,
          'finance-analytics-${brightness.name}',
        );
        await tester.drag(
          find.byType(CustomScrollView).last,
          const Offset(0, -700),
        );
        await tester.pumpAndSettle();
        await DesignRender.capture(
          tester,
          'finance-analytics-categories-${brightness.name}',
        );
      });
    }

    testWidgets('switches to income categories and to monthly intervals', (
      tester,
    ) async {
      final repository = await pump(tester);
      final income = find.descendant(
        of: find.byType(AppSegmentedControl<bool>),
        matching: find.text('Income'),
      );
      await tester.scrollUntilVisible(find.text('Groceries'), 200);
      await tester.ensureVisible(income);
      await tester.pumpAndSettle();
      await tester.tap(income);
      await tester.pumpAndSettle();
      expect(find.text('Salary'), findsOneWidget);
      expect(repository.requests.last, 'categories:income:Asia/Ho_Chi_Minh');

      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('finance-period-kind')),
        -200,
      );
      await tester.tap(find.byKey(const ValueKey('finance-period-kind')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Year'));
      await tester.pumpAndSettle();
      expect(repository.requests, contains('flow:1-31:true'));
    });

    testWidgets('shows the forbidden state without Retry', (tester) async {
      await pump(
        tester,
        failure: const ApiException(message: 'Forbidden', statusCode: 403),
      );
      expect(find.text('Closing balance'), findsNothing);
      expect(find.text('Retry'), findsNothing);
    });
  });
}
