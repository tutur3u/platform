import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/utils/budget_pace.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/view/budget_detail_sheet.dart';
import 'package:mobile/features/finance/view/transaction_list_body.dart';
import 'package:mobile/features/finance/view/transaction_list_empty.dart';
import 'package:mobile/features/finance/widgets/finance_flow_summary.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/pump_app.dart';
import 'finance_scenes.dart';

/// [child] at a phone [width] with [scale]x text.
Widget _sized(Widget child, {required double width, double scale = 1}) =>
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(width: width, child: child),
        ),
      ),
    );

void _expectWholeLine(WidgetTester tester, String text) {
  final paragraph = tester.renderObject<RenderParagraph>(find.text(text).first);
  expect(paragraph.didExceedMaxLines, isFalse, reason: '$text was cut');
  final lineHeight = paragraph.text.style!.fontSize! * 1.3 * 1.6;
  expect(paragraph.size.height, lessThan(lineHeight), reason: '$text wraps');
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
    );
    await seedFinanceSceneCache();
    // Real glyph widths: the default test font draws every glyph 1em wide.
    for (final font in const {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'Nunito': 'assets/fonts/Nunito-Variable.ttf',
      'JetBrainsMono': 'assets/fonts/JetBrainsMono-Variable.ttf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });

  group('flow summary', () {
    for (final (width, scale) in [(320.0, 1.3), (320.0, 1.0), (430.0, 1.3)]) {
      testWidgets('labels and amounts fit at $width dp, ${scale}x text', (
        tester,
      ) async {
        await tester.pumpThemedHome(
          FinanceScreenScene(
            scene: FinanceScene.overview,
            showAmounts: true,
            page: _sized(
              const FinanceFlowSummary(
                income: 32000000,
                expense: -8420000,
                currency: 'VND',
              ),
              width: width - 32,
              scale: scale,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (final label in ['Income', 'Expense', 'Net']) {
          _expectWholeLine(tester, label);
        }
        for (final amount in ['+32.000.000 ₫', '−8.420.000 ₫']) {
          expect(
            tester
                .renderObject<RenderParagraph>(find.text(amount))
                .didExceedMaxLines,
            isFalse,
          );
        }
      });
    }

    testWidgets('stacks the figures when columns would be too narrow', (
      tester,
    ) async {
      Future<double> spread(double scale) async {
        await tester.pumpThemedHome(
          _sized(
            const FinanceFlowSummary(income: 1, expense: -1, currency: 'VND'),
            width: 288,
            scale: scale,
          ),
        );
        await tester.pumpAndSettle();
        final income = tester.getTopLeft(
          find.byKey(const ValueKey('finance-flow-income')),
        );
        final net = tester.getTopLeft(
          find.byKey(const ValueKey('finance-flow-net')),
        );
        return net.dy - income.dy;
      }

      expect(await spread(1), 0);
      expect(await spread(1.3), greaterThan(0));
    });
  });

  testWidgets('wallet detail fits 320 dp at 1.3x text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 700)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpThemedHome(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(1.3)),
          child: const FinanceScreenScene(
            scene: FinanceScene.walletDetail,
            showAmounts: true,
          ),
        ),
      ),
    );
    await pumpFinanceUntilVisible(
      tester,
      find.byKey(const ValueKey('finance-wallet-flow')),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    _expectWholeLine(tester, 'Expense');
    expect(find.text('1.250.000 ₫'), findsOneWidget);
  });

  testWidgets('hiding amounts masks every wallet detail figure', (
    tester,
  ) async {
    await tester.pumpThemedHome(
      const FinanceScreenScene(scene: FinanceScene.walletDetail),
    );
    await pumpFinanceUntilVisible(
      tester,
      find.byKey(const ValueKey('finance-wallet-flow')),
    );
    await tester.pumpAndSettle();
    final err = tester.takeException();
    if (err != null) debugPrint('OVERFLOW: $err');
    final money = find.textContaining(RegExp(r'\d[.,]\d{3}|₫|\$'));
    expect(money, findsNothing);
    expect(find.text(financeMaskedAmountPlaceholder), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('finance-scene-eye')));
    await tester.pumpAndSettle();
    expect(find.text('1.250.000 ₫'), findsOneWidget);
    expect(find.text('+32.000.000 ₫'), findsWidgets);
  });

  testWidgets('a budget opens its details with pace and Edit', (tester) async {
    await tester.pumpThemedHome(
      const FinanceScreenScene(scene: FinanceScene.budgets, showAmounts: true),
    );
    await pumpFinanceUntilVisible(tester, find.text('Groceries'));
    await tester.pumpAndSettle();
    expect(find.text('1.750.000 ₫ left · 134.615 ₫/day'), findsOneWidget);
    await tester.tap(find.text('Groceries'));
    await tester.pumpAndSettle();
    expect(find.text('Per day'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('finance-budget-detail-edit')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('budget details show what is left per remaining day', (
    tester,
  ) async {
    await tester.pumpThemedHome(
      FinanceScreenScene(
        scene: FinanceScene.budgets,
        showAmounts: true,
        page: BudgetDetailSheet(
          budget: FinanceBudget(
            id: 'groceries-budget',
            name: 'Groceries',
            amount: 5000000,
            spent: 3250000,
            startDate: DateTime(2026, 11),
          ),
          currency: 'VND',
          now: financeSceneDate,
          onEdit: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('134.615 ₫'), findsOneWidget);
    expect(find.text('1.750.000 ₫'), findsOneWidget);
    expect(find.text('13 days left'), findsOneWidget);
    expect(find.text('Monthly'), findsOneWidget);
    expect(find.text('On track'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('transactions empty state', () {
    final month = FinanceTransactionQuery.month(financeSceneDate);
    final cases = {
      'none': (
        TransactionListState(
          status: TransactionListStatus.loaded,
          query: month,
        ),
        TransactionEmptyKind.none,
        'Add first transaction',
      ),
      'filtered': (
        TransactionListState(
          status: TransactionListStatus.loaded,
          query: month.copyWith(kind: FinanceTransactionKind.expense),
        ),
        TransactionEmptyKind.filtered,
        'Clear filters',
      ),
      'wallet filter': (
        TransactionListState(
          status: TransactionListStatus.loaded,
          query: month,
          walletId: 'wallet-vnd',
        ),
        TransactionEmptyKind.filtered,
        'Clear filters',
      ),
      'search': (
        TransactionListState(
          status: TransactionListStatus.loaded,
          query: month,
          search: 'coffee',
        ),
        TransactionEmptyKind.search,
        'Clear search',
      ),
    };
    for (final MapEntry(key: name, value: (state, kind, action))
        in cases.entries) {
      testWidgets('$name shows $action', (tester) async {
        expect(transactionEmptyKindOf(state), kind);
        final calls = <String>[];
        await tester.pumpThemedHome(
          TransactionListBody(
            state: state.copyWith(hasMore: false),
            controller: ScrollController(),
            now: financeSceneDate,
            onRefresh: () async {},
            onTransactionTap: (_) {},
            onFiltersChanged: (_, _) {},
            onClearFilters: () => calls.add('filters'),
            onClearSearch: () => calls.add('search'),
            onCreate: () => calls.add('create'),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(ValueKey('finance-transactions-empty-${kind.name}')),
          findsOneWidget,
        );
        if (kind != TransactionEmptyKind.search) {
          expect(find.text('Clear search'), findsNothing);
          expect(find.textContaining('different keyword'), findsNothing);
        }
        if (kind == TransactionEmptyKind.none) {
          expect(find.text('No transactions in November 2026'), findsOneWidget);
          expect(find.text('Clear filters'), findsNothing);
        }
        await tester.tap(find.text(action));
        await tester.pump();
        expect(calls, [
          switch (kind) {
            TransactionEmptyKind.none => 'create',
            TransactionEmptyKind.filtered => 'filters',
            TransactionEmptyKind.search => 'search',
          },
        ]);
      });
    }
  });

  group('periods', () {
    test('weeks start on Monday and step by seven days', () {
      final week = FinancePeriod.containing(
        FinancePeriodKind.week,
        DateTime(2026, 11, 19),
      );
      expect(week.start, DateTime(2026, 11, 16));
      expect(week.end, DateTime(2026, 11, 23));
      expect(week.shift(-1).start, DateTime(2026, 11, 9));
      expect(week.bucketOf(DateTime(2026, 11, 22, 23)), 6);
      expect(week.bucketOf(DateTime(2026, 11, 23)), isNull);
    });

    test('months and years bucket by day and month', () {
      final month = FinancePeriod.containing(
        FinancePeriodKind.month,
        DateTime(2026, 2, 10),
      );
      expect(month.bucketCount, 28);
      expect(month.bucketOf(DateTime(2026, 2, 28, 12)), 27);
      final year = FinancePeriod.containing(
        FinancePeriodKind.year,
        DateTime(2026, 7),
      );
      expect(year.bucketCount, 12);
      expect(year.bucketOf(DateTime(2026, 12, 31)), 11);
      expect(year.label('en'), '2026');
    });
  });

  group('budget pace', () {
    final budget = FinanceBudget(
      id: 'b',
      name: 'Groceries',
      amount: 5000000,
      spent: 3250000,
      startDate: DateTime(2026, 11),
    );

    test('counts today among the days left', () {
      expect(budgetDaysLeft(budget, DateTime(2026, 11, 18, 9)), 13);
      expect(budgetDaysLeft(budget, DateTime(2026, 11, 30, 23)), 1);
    });

    test('spreads what is left over the remaining days', () {
      expect(budgetPerDay(budget, DateTime(2026, 11, 18)), 1750000 / 13);
    });

    test('has no daily allowance once over the limit', () {
      final over = FinanceBudget(
        id: 'o',
        name: 'Over',
        amount: 100,
        spent: 150,
        startDate: DateTime(2026, 11),
      );
      expect(budgetPerDay(over, DateTime(2026, 11, 18)), isNull);
    });
  });
}
