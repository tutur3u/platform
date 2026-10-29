import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/view/insights/pacing_glyph.dart';
import 'package:mobile/features/mastermind/view/insights/usage_chart_panel.dart';

import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_time_finder.dart';
import '../../../helpers/mastermind_usage_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

final Map<String, dynamic> _usage = usageJson(
  instances: [
    usagePoint('Claude pool A'),
    usagePoint('Claude pool B', session: 30, sessionPacing: 'SHORT'),
    usagePoint('Claude pool C', session: null, sessionPacing: null),
    usagePoint('Codex pool A', session: 90, sessionPacing: 'SURPLUS'),
  ],
  series: [
    ...usageSeries('Claude pool A'),
    ...usageSeries('Claude pool B', session: [60, 45, 30]),
    ...usageSeries('Claude pool C', session: [60, null, null]),
  ],
  credits: [
    creditPoint('Codex pool A', t: '2026-01-31T17:15:00+00:00', remaining: 130),
    creditPoint('Codex pool A', target: null),
  ],
  quotas: [
    {'instance': 'Claude pool A', 'remaining_percent': 60, 'age_seconds': 300},
    {
      'instance': 'Unknown account',
      'remaining_percent': null,
      'age_seconds': 60,
    },
    {'instance': 'Claude pool B', 'remaining_percent': 30, 'age_seconds': null},
  ],
  forecasts: [
    {
      'instance': 'Claude pool A',
      'projected_empty_at': null,
      'resets_at': '2026-01-31T11:00:00+00:00',
    },
    {
      'instance': 'Claude pool B',
      'projected_empty_at': '2026-01-31T14:10:00+00:00',
      'resets_at': '2026-01-31T18:00:00+00:00',
    },
  ],
);

void main() {
  testWidgets('Vietnamese at 200% keeps the final control above the dock', (
    tester,
  ) async {
    await pumpInsights(
      tester,
      _usage,
      locale: const Locale('vi'),
      textScale: 2,
      size: const Size(430, 800),
      dockClearance: 120,
    );
    expect(
      Localizations.localeOf(
        tester.element(find.byType(CustomScrollView).first),
      ).languageCode,
      'vi',
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -20000));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.getRect(find.byType(AppGroupedRow).last).bottom,
      lessThanOrEqualTo(680),
    );
  });

  group('pools', () {
    testWidgets('most urgent first: SHORT, unknown, OK, SURPLUS', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      final order = [
        'Claude pool B',
        'Claude pool C',
        'Claude pool A',
        'Codex pool A',
      ];
      final tops = [for (final label in order) top(tester, label)];
      expect([...tops]..sort(), tops);
    });

    testWidgets('one verdict per pool, a word with a shape', (tester) async {
      await pumpInsights(tester, _usage);
      // B is SHORT. A and C (session unread, weekly OK) are on pace, and the
      // Codex pool's worse window is OK, not its SURPLUS session.
      expect(find.byType(PacingGlyph), findsNWidgets(4));
      expect(find.text('Running short'), findsOneWidget);
      expect(find.text('On pace'), findsNWidgets(3));
      for (final word in ['SHORT', 'OK', 'SURPLUS', 'unknown', 'Pacing']) {
        expect(find.text(word), findsNothing, reason: word);
      }
    });

    testWidgets('the reserve pacing note sits behind the info button', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      const info = 'This is the chart reserve check, not the routing decision.';
      expect(find.text(info), findsNothing);
      await tester.tap(find.byTooltip('Reserve pacing (chart rule)').first);
      await tester.pumpAndSettle();
      expect(find.text(info), findsOneWidget);
      expect(find.text('Reserve pacing (chart rule)'), findsOneWidget);
    });

    testWidgets('an unread window shows a dash, never zero', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.text('—'), findsOneWidget);
      expect(find.text('Not published yet'), findsOneWidget);
      expect(find.text('0%'), findsNothing);
      expect(find.text('Session left'), findsNWidgets(4));
      expect(find.text('Weekly left'), findsNWidgets(4));
    });

    testWidgets('shows burn and a signed projection', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.textContaining('Burn rate 4.2 pp/h'), findsWidgets);
      expect(find.textContaining('Projected at reset +12 pp'), findsWidgets);
    });

    testWidgets('the reset is a GMT+7 time, with the day when it differs', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      // Read at 00:30 on Feb 1 (GMT+7); the window reset at 18:00 on Jan 31.
      expect(find.text('Resets Jan 31 18:00'), findsWidgets);
    });

    testWidgets('pools are never stacked: one chart each', (tester) async {
      await pumpInsights(tester, _usage);
      // Four pools, plus balance and burn for the one Codex pool with credits.
      expect(find.byType(UsageChartPanel), findsNWidgets(6));
      expect(find.text('Claude pool A'), findsWidgets);
    });

    testWidgets('a pool with no series has its text but no plot', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      // Pools A, B and C plot, with the credits balance and burn; the Codex
      // pool has no series, so its panel carries the summary alone.
      expect(find.byType(ChartPlot), findsNWidgets(5));
    });
  });

  group('credits', () {
    testWidgets('are credits, never money or tokens', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.text('Codex pool A · Codex credits'), findsOneWidget);
      expect(find.text('120 credits'), findsOneWidget);
      expect(find.text('10 credits/day'), findsWidgets);
      expect(find.text('Credits are not money or tokens.'), findsOneWidget);
      expect(find.textContaining(r'$'), findsNothing);
    });

    testWidgets('a missing daily target says so', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.text('Target unavailable'), findsOneWidget);
      expect(find.textContaining('Daily target unavailable.'), findsOneWidget);
    });
  });

  group('quota and forecasts', () {
    testWidgets('least left first, unknown last, as of an age', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.text('as of 5 min ago'), findsOneWidget);
      expect(find.text('Unknown account'), findsOneWidget);
      final base = top(tester, 'Quota');
      double rowTop(String label) => tester
          .widgetList<Text>(find.text(label))
          .map((w) => tester.getTopLeft(find.byWidget(w)).dy)
          .where((y) => y > base)
          .reduce((a, b) => a < b ? a : b);
      expect(rowTop('Claude pool B'), lessThan(rowTop('Claude pool A')));
      expect(rowTop('Claude pool A'), lessThan(rowTop('Unknown account')));
    });

    testWidgets('forecasts: soonest empty first, then not projected', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      expect(
        find.text('Projected empty Jan 31, 2026 21:10 GMT+7'),
        findsOneWidget,
      );
      expect(
        find.text('Not projected to run out before reset'),
        findsOneWidget,
      );
    });
  });

  group('coverage', () {
    testWidgets('no source: no plot, the coverage stands in', (tester) async {
      await pumpInsights(
        tester,
        usageJson(
          coverage: 'unavailable',
          instances: [usagePoint('Claude pool A')],
          series: usageSeries('Claude pool A'),
        ),
      );
      expect(find.byType(ChartPlot), findsNothing);
      expect(find.byType(UsageChartPanel), findsOneWidget);
      expect(find.text('Unavailable'), findsWidgets);
    });

    testWidgets('partial data prefixes the summary and still plots', (
      tester,
    ) async {
      await pumpInsights(
        tester,
        usageJson(
          coverage: 'partial',
          instances: [usagePoint('Claude pool A')],
          series: usageSeries('Claude pool A'),
        ),
      );
      // A muted caption says so; the plot's text equivalent leads with it.
      expect(find.text('Partial data'), findsOneWidget);
      expect(find.byType(ChartPlot), findsOneWidget);
      expect(
        tester.widget<ChartPlot>(find.byType(ChartPlot)).summary,
        startsWith('Partial data: Claude pool A'),
      );
    });
  });

  group('whole-section states', () {
    testWidgets('empty: nothing reported', (tester) async {
      await pumpInsights(tester, usageJson());
      expect(find.text('No usage data reported.'), findsOneWidget);
      expect(find.byType(UsageChartPanel), findsNothing);
    });

    testWidgets('stale data reads as last published, pools still shown', (
      tester,
    ) async {
      final json = Map<String, dynamic>.of(_usage)
        ..['generated_at'] = '2026-01-31T14:30:00+00:00';
      await pumpInsights(tester, json);
      expect(findTimeLabel('Published 3h'), findsOneWidget);
      expect(find.text('Claude pool B'), findsWidgets);
    });

    testWidgets('offline keeps the cached pools under a warning strip', (
      tester,
    ) async {
      final harness = await pumpInsights(tester, _usage);
      harness.scheduler.setOnline(online: false);
      harness.source.fetcher = () async =>
          const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.textContaining('Offline · showing'), findsOneWidget);
      expect(find.text('Claude pool B'), findsWidgets);
    });

    testWidgets('forbidden says so and shows no pools', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            const SnapshotFetch.unavailable(SnapshotUnavailableKind.forbidden);
      await pumpInsights(tester, _usage, source: source);
      expect(
        find.text("This account isn't allowed to view Mastermind"),
        findsOneWidget,
      );
      expect(find.text('Claude pool B'), findsNothing);
    });
  });

  group('redaction', () {
    testWidgets('shows only the opaque pool labels, no id or digest', (
      tester,
    ) async {
      await pumpInsights(tester, _usage);
      expect(find.textContaining('Security'), findsNothing);
      expect(find.textContaining('item-'), findsNothing);
      expect(find.textContaining(testDigest), findsNothing);
    });
  });

  group('chart table route', () {
    testWidgets('Table opens the same series, and Back returns', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindInsights);
      await pumpInsights(tester, _usage, router: router);
      await tester.tap(find.text('Table').first);
      await tester.pumpAndSettle();
      final path = workUri(router).path;
      expect(path, startsWith('/mastermind/insights/usage/table/'));
      expect(Routes.isMastermindInsightsTableLocation(path), isTrue);
      expect(find.text('Session: 60%'), findsOneWidget);
      expect(find.text('Weekly: 40%'), findsOneWidget);
      expect(find.byType(AppBar), findsNothing);
      // The chart's title is in the body too, not only the shell title.
      expect(find.textContaining(' · Budget left'), findsOneWidget);

      expect(router.canPop(), isTrue);
      router.pop();
      await tester.pumpAndSettle();
      expect(workUri(router).path, Routes.mastermindInsights);
    });

    testWidgets('a null reading is Unavailable in the table, not zero', (
      tester,
    ) async {
      final router = workRouter(
        Routes.mastermindInsightsTablePath('usage', 'budget:Claude pool C'),
      );
      await pumpInsights(tester, _usage, router: router);
      expect(find.text('Session: Unavailable'), findsWidgets);
      expect(find.textContaining(': 0%'), findsNothing);
    });

    testWidgets('a chart the snapshot lacks is not an error', (tester) async {
      final router = workRouter(
        Routes.mastermindInsightsTablePath('usage', 'budget:Claude pool Z'),
      );
      await pumpInsights(tester, _usage, router: router);
      expect(
        find.text('This chart is no longer in Mastermind'),
        findsOneWidget,
      );
      await tester.tap(find.text('Back to Insights'));
      await tester.pumpAndSettle();
      expect(workUri(router).path, Routes.mastermindInsights);
    });

    testWidgets('an unknown section or malformed id is the same state', (
      tester,
    ) async {
      for (final path in [
        Routes.mastermindInsightsTablePath('fleet', 'budget:Claude pool A'),
        Routes.mastermindInsightsTablePath('usage', 'nonsense'),
      ]) {
        final router = workRouter(path);
        await pumpInsights(tester, _usage, router: router);
        expect(
          find.text('This chart is no longer in Mastermind'),
          findsOneWidget,
          reason: path,
        );
      }
    });
  });

  group('layout', () {
    testWidgets('the last row clears the dock', (tester) async {
      const height = 800.0;
      const dock = 120.0;
      await pumpInsights(
        tester,
        _usage,
        size: const Size(430, height),
        dockClearance: dock,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -9000));
      await tester.pumpAndSettle();
      final last = tester.getRect(find.byType(AppGroupedRow).last);
      expect(last.bottom, lessThanOrEqualTo(height - dock));
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      await pumpInsights(tester, _usage);
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byIcon(Icons.arrow_back), findsNothing);
    });
  });
}
