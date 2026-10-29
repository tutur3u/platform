import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_insights_page.dart';
import 'package:mobile/features/mastermind/view/insights/pacing_glyph.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_usage_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

const _quotaLabels = [
  'Claude pool A',
  'Claude pool B',
  'Claude pool C',
  'Claude pool D',
  'Claude pool E',
  'Codex pool A',
  'Codex pool B',
];

void main() {
  group('pacing verdict', () {
    testWidgets('SHORT next to a zero burn reads "not measured yet"', (
      tester,
    ) async {
      await pumpInsights(
        tester,
        usageJson(
          instances: [
            usagePoint(
              'Claude pool B',
              session: 28,
              sessionPacing: 'SHORT',
              weeklyPacing: null,
              weekly: null,
              burn: 0,
              projected: 28,
            ),
          ],
        ),
      );
      expect(find.text('Running short'), findsOneWidget);
      expect(
        find.text('Burn not measured yet · Projected at reset +28 pp'),
        findsOneWidget,
      );
      expect(find.textContaining('0 pp/h'), findsNothing);
    });

    testWidgets('no pacing on either window is a static hollow shape', (
      tester,
    ) async {
      await pumpInsights(
        tester,
        usageJson(
          instances: [
            usagePoint(
              'Claude pool A',
              sessionPacing: null,
              weeklyPacing: null,
            ),
          ],
        ),
      );
      expect(find.text('No pacing data'), findsOneWidget);
      // Not the dashed outline that read as a loading spinner.
      expect(
        find.descendant(
          of: find.byType(PacingGlyph),
          matching: find.byType(StatusGlyph),
        ),
        findsNothing,
      );
    });
  });

  group('chart panel', () {
    final json = usageJson(
      instances: [usagePoint('Claude pool A'), usagePoint('Claude pool B')],
      series: [
        ...usageSeries('Claude pool A'),
        ...usageSeries('Claude pool B', weekly: const [null, null, null]),
      ],
    );

    testWidgets('Table sits in the header with a 44-pt target', (tester) async {
      await pumpInsights(tester, json);
      final table = find.text('Table').first;
      final plot = find.byType(ChartPlot).first;
      expect(tester.getTopLeft(table).dy, lessThan(tester.getTopLeft(plot).dy));
      final target = tester.getSize(
        find.ancestor(of: table, matching: find.byType(AppTapTarget)).first,
      );
      expect(target.width, greaterThanOrEqualTo(44));
      expect(target.height, greaterThanOrEqualTo(44));
    });

    testWidgets('the legend names only the lines that are drawn', (
      tester,
    ) async {
      await pumpInsights(tester, json);
      final legends = tester
          .widgetList<ChartLegend>(find.byType(ChartLegend))
          .toList();
      expect(legends, hasLength(2));
      // Pool A draws both windows; pool B never reported a weekly reading.
      final drawn = [
        for (final legend in legends) legend.series.map((s) => s.id).toList(),
      ];
      expect(
        drawn,
        containsAll([
          ['session', 'weekly'],
          ['session'],
        ]),
      );
    });

    testWidgets('the plot is labelled with its text summary', (tester) async {
      final semantics = tester.ensureSemantics();
      await pumpInsights(tester, json);
      expect(
        find.bySemanticsLabel(RegExp('^Claude pool B · Session 60% left')),
        findsWidgets,
      );
      semantics.dispose();
    });
  });

  group('quota', () {
    testWidgets('caps at five with Show all and a count', (tester) async {
      await pumpInsights(
        tester,
        usageJson(
          quotas: [
            for (final (i, label) in _quotaLabels.indexed)
              {
                'instance': label,
                'remaining_percent': (i + 1) * 10,
                'age_seconds': 60,
              },
          ],
        ),
      );
      expect(find.text('Show all 7'), findsOneWidget);
      // Least left first: the two with the most left wait behind Show all.
      expect(find.text('Codex pool B'), findsNothing);
      await tester.tap(find.text('Show all 7'));
      await tester.pumpAndSettle();
      expect(find.text('Codex pool A'), findsOneWidget);
      expect(find.text('Codex pool B'), findsOneWidget);
    });
  });

  group('Forge v1 fixture', () {
    setUpAll(initializeDateFormatting);

    testWidgets('weekly-only pools: a reason per window, no bare unknown', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(430, 12000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final harness = MastermindViewHarness(
        source: FakeHubSource(
          bytes: File(
            'test/fixtures/mastermind/forge_v1_redacted.json',
          ).readAsBytesSync(),
        ),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpApp(harness.wrap(const MastermindInsightsPage()));
      await tester.pumpAndSettle();
      final pools = find.byType(PacingGlyph).evaluate().length;
      expect(pools, greaterThan(0));
      expect(find.text('No pacing data'), findsNWidgets(pools));
      expect(find.text('Weekly left'), findsNWidgets(pools));
      expect(find.textContaining('Not connected'), findsWidgets);
      expect(find.textContaining('No samples published'), findsOneWidget);
      final words = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data?.toLowerCase());
      expect(words, isNot(contains('unknown')));
    });
  });
}
