import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'chart_fixtures.dart';

Widget host(Widget child, {double scale = 1}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(
      disableAnimations: true,
      textScaler: TextScaler.linear(scale),
    ),
    child: Scaffold(body: SizedBox(width: 360, child: child)),
  ),
);

Widget interactive(ChartSelectionController controller) {
  final series = fixtureSeries();
  return Builder(
    builder: (context) => Column(
      children: [
        ChartPlot(
          controller: controller,
          bucketCount: 6,
          seriesCount: series.length,
          summary: 'Synthetic chart summary',
          painterBuilder: (selection) => LinePainter(
            series: series,
            palette: AppChartPalette.of(context),
            axis: const ChartValueAxis(min: 0, max: 30),
            selectedBucket: selection?.bucket,
            selectedSeries: selection?.series ?? 0,
          ),
        ),
        ChartReadout(
          controller: controller,
          readout: (selection) {
            final s = series[selection.series];
            return chartPointReadout(
              s.points[selection.bucket],
              s,
              chartLabels,
              last: selection.bucket == s.points.length - 1,
            );
          },
        ),
      ],
    ),
  );
}

void main() {
  testWidgets(
    'tap and horizontal drag select nearest bucket without animation',
    (tester) async {
      final controller = ChartSelectionController();
      addTearDown(controller.dispose);
      await tester.pumpWidget(host(interactive(controller)));
      final plot = find.byType(ChartPlot);
      await tester.tapAt(tester.getTopLeft(plot) + const Offset(145, 80));
      await tester.pump();
      expect(controller.value?.bucket, 2);
      expect(find.textContaining('Unavailable'), findsOneWidget);
      await tester.dragFrom(
        tester.getTopLeft(plot) + const Offset(145, 80),
        const Offset(160, 0),
      );
      await tester.pump();
      expect(controller.value?.bucket, greaterThan(2));
      expect(tester.hasRunningAnimations, isFalse);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('keyboard arrows cycle buckets and series; escape clears', (
    tester,
  ) async {
    final controller = ChartSelectionController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(host(interactive(controller)));
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    expect(controller.value, const ChartSelection(bucket: 0));
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    expect(controller.value?.bucket, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    expect(controller.value?.bucket, 0);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    expect(controller.value?.series, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    expect(controller.value?.series, 0);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(controller.value, isNull);
    expect(tester.hasRunningAnimations, isFalse);
  });
  testWidgets('semantics increase and decrease drive localized live readout', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    try {
      final controller = ChartSelectionController();
      addTearDown(controller.dispose);
      await tester.pumpWidget(host(interactive(controller)));
      final node = tester.getSemantics(
        find.bySemanticsLabel('Synthetic chart summary'),
      );
      node.owner!.performAction(node.id, SemanticsAction.increase);
      await tester.pump();
      expect(controller.value?.bucket, 0);
      expect(
        find.textContaining(
          '2026-01-02 23:00 GMT+7 · Synthetic A · 12.0 items · partial',
        ),
        findsOneWidget,
      );
      final readout = tester.getSemantics(find.byType(ChartReadout));
      expect(readout.getSemanticsData().flagsCollection.isLiveRegion, isTrue);
      controller.select(5);
      await tester.pump();
      expect(find.textContaining('partial bucket'), findsOneWidget);
      node.owner!.performAction(node.id, SemanticsAction.decrease);
      await tester.pump();
      expect(controller.value?.bucket, 4);
    } finally {
      handle.dispose();
    }
  });
  testWidgets('vertical drag remains with the scrolling parent', (
    tester,
  ) async {
    final selection = ChartSelectionController();
    final scroll = ScrollController();
    addTearDown(selection.dispose);
    addTearDown(scroll.dispose);
    await tester.pumpWidget(
      host(
        ListView(
          controller: scroll,
          children: [interactive(selection), const SizedBox(height: 1400)],
        ),
      ),
    );
    await tester.drag(find.byType(ChartPlot), const Offset(0, -120));
    await tester.pumpAndSettle();
    expect(scroll.offset, greaterThan(0));
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets('full-resolution table matches series at scale $scale', (
      tester,
    ) async {
      final series = fixtureSeries();
      final table = ChartTableData.fromSeries(series, chartLabels);
      expect(table.rows, hasLength(series.first.points.length));
      expect(table.rows[2].skip(1), everyElement('Unavailable'));
      expect(table.headers[1], 'Synthetic A (items)');
      await tester.pumpWidget(
        host(
          SingleChildScrollView(child: ChartTable(data: table)),
          scale: scale,
        ),
      );
      expect(find.byType(ChartTableRow), findsNWidgets(6));
      expect(find.text('Synthetic A (items): 18.0'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'panel starts with summary and exposes Table for unavailable data',
    (tester) async {
      var opened = false;
      await tester.pumpWidget(
        host(
          ChartPanel(
            summary: 'Unavailable',
            table: ChartTableData(headers: const ['Time'], rows: const []),
            tableLabel: 'Table',
            onTable: (_) => opened = true,
          ),
        ),
      );
      expect(find.byType(ChartPlot), findsNothing);
      expect(find.text('Unavailable'), findsOneWidget);
      await tester.tap(find.text('Table'));
      expect(opened, isTrue);
    },
  );
  testWidgets('all status glyphs retain a word beside their shape', (
    tester,
  ) async {
    await tester.pumpWidget(
      host(
        Column(
          children: [
            for (final status in ChartStatus.values)
              StatusGlyph(status: status, label: 'Status ${status.name}'),
          ],
        ),
      ),
    );
    for (final status in ChartStatus.values) {
      expect(find.text('Status ${status.name}'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });
  test('readout retains unknown, units, coverage, and partial status', () {
    final series = fixtureSeries().first;
    expect(
      chartPointReadout(series.points[2], series, chartLabels, last: false),
      contains('GMT+7 · Synthetic A · Unavailable · partial'),
    );
    expect(
      chartPointReadout(series.points.last, series, chartLabels, last: true),
      contains('9.0 items · partial · partial bucket'),
    );
  });
}
