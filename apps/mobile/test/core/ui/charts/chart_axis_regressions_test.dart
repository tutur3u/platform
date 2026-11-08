import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';

import 'chart_fixtures.dart';
import 'chart_recording_canvas.dart';

const size = Size(360, 220);
final palette = AppChartPalette.fromTokens(AppColorTokens.light);
const mixed = ChartValueAxis(min: -20, max: 30);

Rect gridBounds(ChartRecordingCanvas canvas) {
  final rules = canvas.rules;
  final points = rules.expand((r) => [r.start, r.end]).toList();
  return Rect.fromLTRB(
    points.map((p) => p.dx).reduce((a, b) => a < b ? a : b),
    points.map((p) => p.dy).reduce((a, b) => a < b ? a : b),
    points.map((p) => p.dx).reduce((a, b) => a > b ? a : b),
    points.map((p) => p.dy).reduce((a, b) => a > b ? a : b),
  );
}

void expectReadable(List<RecordedLabel> labels) {
  expect(labels.length, greaterThanOrEqualTo(2));
  for (final label in labels) {
    expect(label.lines, 1, reason: 'Value labels must not wrap');
    expect(label.rect.left, greaterThanOrEqualTo(0));
    expect(label.rect.top, greaterThanOrEqualTo(0));
    expect(label.rect.right, lessThanOrEqualTo(size.width));
    expect(label.rect.bottom, lessThanOrEqualTo(size.height));
  }
  for (var i = 0; i < labels.length; i++) {
    for (var j = i + 1; j < labels.length; j++) {
      expect(
        labels[i].rect.inflate(3).overlaps(labels[j].rect.inflate(3)),
        isFalse,
        reason: 'Measured value labels must leave space',
      );
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final scale in [1.0, 2.0]) {
    testWidgets('F1 taps actual marker centres and boundary at $scale', (
      tester,
    ) async {
      final controller = ChartSelectionController();
      addTearDown(controller.dispose);
      final series = ChartSeries(
        id: 'synthetic',
        label: 'Synthetic',
        slot: 0,
        points: fixturePoints([0, 6, 12, 18, 24, 30]),
      );
      late LinePainter painter;
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              textScaler: TextScaler.linear(scale),
              disableAnimations: true,
            ),
            child: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: size.width,
                child: ChartPlot(
                  controller: controller,
                  bucketCount: 6,
                  seriesCount: 1,
                  summary: 'Synthetic selection',
                  painterBuilder: (selection) {
                    return painter = LinePainter(
                      series: [series],
                      palette: palette,
                      axis: const ChartValueAxis(min: 0, max: 30),
                      textScaler: TextScaler.linear(scale),
                      selectedBucket: selection?.bucket,
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      );
      final recording = ChartRecordingCanvas();
      painter.paint(recording, size);
      final geometry = painter.chartCanvas(size);
      expectReadable(
        recording.labels.take(geometry.valueLayout.ticks.length).toList(),
      );
      geometry.dispose();
      final markers =
          recording.paths
              .where(
                (p) =>
                    (p.$1.width - 8).abs() < 0.01 &&
                    (p.$1.height - 8).abs() < 0.01,
              )
              .map((p) => p.$1.center)
              .toSet()
              .toList()
            ..sort((a, b) => a.dx.compareTo(b.dx));
      expect(markers, hasLength(6));
      final origin = tester.getTopLeft(find.byType(ChartPlot));
      await tester.tapAt(origin + markers.first);
      await tester.pump();
      expect(controller.value?.bucket, 0);
      await tester.tapAt(origin + markers.last);
      await tester.pump();
      expect(controller.value?.bucket, 5);
      final boundary = (markers[0] + markers[1]) / 2;
      await tester.tapAt(origin + boundary - const Offset(0.5, 0));
      await tester.pump();
      expect(controller.value?.bucket, 0);
      await tester.tapAt(origin + boundary + const Offset(0.5, 0));
      await tester.pump();
      expect(controller.value?.bucket, 1);
      expect(tester.hasRunningAnimations, isFalse);
      expect(tester.takeException(), isNull);
    });

    test('F3 vertical value labels fit without overlap at $scale', () {
      final canvas = ChartRecordingCanvas();
      ChartCanvas(
        size,
        palette,
        axis: mixed,
        textScaler: TextScaler.linear(scale),
      ).drawAxes(canvas, []);
      // The last paragraph is the time-zone caption, outside this finding.
      expectReadable(canvas.labels.take(canvas.labels.length - 1).toList());
    });
    test('F3 horizontal value labels fit without overlap at $scale', () {
      final canvas = ChartRecordingCanvas();
      StackedBarPainter(
        categories: [
          ChartCategoryValue(label: '', values: const [null]),
        ],
        series: const [],
        palette: palette,
        axis: mixed,
        horizontal: true,
        textScaler: TextScaler.linear(scale),
      ).paint(canvas, size);
      expectReadable(canvas.labels.where((p) => p.rect.width > 0).toList());
    });
  }

  final ranges = <String, ChartValueAxis>{
    'mixed': mixed,
    'positive': ChartValueAxis.auto([1, 30], signed: true),
    'negative': ChartValueAxis.auto([-20, -1], signed: true),
  };
  for (final entry in ranges.entries) {
    test('F2 line zero rule includes ${entry.key} signed range', () {
      final canvas = ChartRecordingCanvas();
      ChartCanvas(size, palette, axis: entry.value).drawAxes(canvas, []);
      final bounds = gridBounds(canvas);
      final expected = bounds.bottom - entry.value.fraction(0) * bounds.height;
      expect(
        canvas.rules.where(
          (r) =>
              r.color.toARGB32() == palette.neutral.toARGB32() &&
              r.width == 1.5 &&
              (r.start.dy - expected).abs() < 0.01 &&
              (r.end.dy - expected).abs() < 0.01,
        ),
        hasLength(1),
      );
    });
    for (final horizontal in [false, true]) {
      test(
        'F2 ${entry.key} bar zero and placeholder horizontal=$horizontal',
        () {
          final canvas = ChartRecordingCanvas();
          StackedBarPainter(
            categories: [
              ChartCategoryValue(label: '', values: const [null]),
            ],
            series: const [],
            palette: palette,
            axis: entry.value,
            horizontal: horizontal,
          ).paint(canvas, size);
          final bounds = gridBounds(canvas);
          final zero = horizontal
              ? bounds.left + entry.value.fraction(0) * bounds.width
              : bounds.bottom - entry.value.fraction(0) * bounds.height;
          final rule = canvas.rules.where(
            (r) =>
                r.color.toARGB32() == palette.neutral.toARGB32() &&
                r.width == 1.5,
          );
          expect(
            rule,
            hasLength(1),
            reason: 'Zero is independent of quarter ticks',
          );
          expect(
            horizontal ? rule.single.start.dx : rule.single.start.dy,
            closeTo(zero, 0.01),
          );
          final placeholder = canvas.paths
              .map((p) => p.$1)
              .reduce((a, b) => a.expandToInclude(b));
          final expected = horizontal
              ? zero.clamp(bounds.left + 4, bounds.right - 4)
              : zero.clamp(bounds.top + 4, bounds.bottom - 4);
          expect(
            horizontal ? placeholder.center.dx : placeholder.center.dy,
            closeTo(expected, 0.01),
          );
        },
      );
    }
  }
}
