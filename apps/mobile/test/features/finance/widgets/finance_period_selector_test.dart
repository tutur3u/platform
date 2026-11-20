import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';

import '../../../helpers/pump_app.dart';

final _now = DateTime(2026, 11, 20, 9);

Future<List<FinancePeriod>> _pumpBar(
  WidgetTester tester, {
  FinancePeriod? period,
  String? customLabel,
  List<FinancePeriodKind> kinds = financeAllPeriodKinds,
  VoidCallback? onAllTime,
}) async {
  final changes = <FinancePeriod>[];
  await tester.pumpThemedHome(
    Scaffold(
      body: Center(
        child: SizedBox(
          width: 320,
          child: FinancePeriodBar(
            period: period,
            customLabel: customLabel,
            now: _now,
            kinds: kinds,
            onChanged: changes.add,
            onAllTime: onAllTime,
            onCustomRange: () async {},
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return changes;
}

void main() {
  setUpAll(() => initializeDateFormatting('en'));

  test('day periods step by calendar day and round-trip their query', () {
    final day = FinancePeriod.containing(FinancePeriodKind.day, _now);
    expect(day.start, DateTime(2026, 11, 20));
    expect(day.end, DateTime(2026, 11, 21));
    expect(day.shift(-20).start, DateTime(2026, 10, 31));
    expect(day.bucketCount, 1);
    expect(day.bucketOf(DateTime(2026, 11, 20, 23, 59)), 0);
    expect(day.label('en'), 'Fri, Nov 20, 2026');
    expect(financePeriodOf(day.query), day);
    final month = FinancePeriod.containing(FinancePeriodKind.month, _now);
    expect(financePeriodOf(month.query), month);
    expect(financePeriodOf(const FinanceTransactionQuery()), isNull);
  });

  testWidgets('one title names the granularity above the period', (
    tester,
  ) async {
    final month = FinancePeriod.containing(FinancePeriodKind.month, _now);
    final changes = await _pumpBar(tester, period: month);
    expect(find.text('Month'), findsOneWidget);
    expect(find.text('November 2026'), findsOneWidget);

    final bar = tester.getRect(
      find.byKey(const ValueKey('finance-period-bar')),
    );
    final title = tester.getRect(
      find.byKey(const ValueKey('finance-period-label')),
    );
    // The label is centred in the pill, not pushed aside by another control.
    expect((title.center.dx - bar.center.dx).abs(), lessThan(12));

    await tester.tap(find.byTooltip('Next period'));
    expect(changes, isEmpty, reason: 'No period after the current one');
    await tester.tap(find.byTooltip('Previous period'));
    expect(changes.single, month.shift(-1));
  });

  testWidgets('the granularity sheet lands on the period each choice shows', (
    tester,
  ) async {
    final october = FinancePeriod.containing(
      FinancePeriodKind.month,
      DateTime(2026, 10, 5),
    );
    final changes = await _pumpBar(tester, period: october);
    await tester.tap(find.byKey(const ValueKey('finance-period-kind')));
    await tester.pumpAndSettle();
    for (final label in ['Day', 'Week', 'Year', 'Custom date range']) {
      expect(find.text(label), findsOneWidget);
    }
    // Other granularities anchor on the visible period's start.
    expect(find.text('Thu, Oct 1, 2026'), findsOneWidget);
    await tester.tap(find.text('Day'));
    await tester.pumpAndSettle();
    expect(
      changes.single,
      FinancePeriod.containing(FinancePeriodKind.day, DateTime(2026, 10)),
    );

    // Choosing the visible granularity again returns to the current period.
    await tester.tap(find.byKey(const ValueKey('finance-period-kind')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Month').last);
    await tester.pumpAndSettle();
    expect(
      changes.last,
      FinancePeriod.containing(FinancePeriodKind.month, _now),
    );
  });

  testWidgets('chart surfaces leave Day out and custom ranges say so', (
    tester,
  ) async {
    await _pumpBar(
      tester,
      customLabel: '1/11/2026 – 15/11/2026',
      kinds: financeChartPeriodKinds,
    );
    expect(find.text('Custom'), findsOneWidget);
    expect(find.text('1/11/2026 – 15/11/2026'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('finance-period-kind')));
    await tester.pumpAndSettle();
    expect(find.text('Day'), findsNothing);
    expect(find.text('Week'), findsOneWidget);
  });
}
