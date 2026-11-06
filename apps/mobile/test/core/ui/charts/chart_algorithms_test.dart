import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/charts/charts.dart';

import 'chart_fixtures.dart';

void main() {
  test('nulls split paths and last bucket is partial', () {
    final parts = segment(fixturePoints(), cadence: const Duration(hours: 1));
    expect(parts.map((s) => s.length), [2, 3]);
    expect(parts.last.last.partial, isTrue);
    expect(parts.expand((s) => s).every((p) => p.y != null), isTrue);
    expect(fixturePoints().last.partial, isFalse);
  });
  test('cadence breaks only above the cadence', () {
    final points = [
      for (final minute in [0, 15, 31, 46])
        ChartPoint(t: chartEpoch.add(Duration(minutes: minute)), y: 1),
    ];
    expect(
      segment(
        points,
        cadence: const Duration(minutes: 15),
      ).map((s) => s.length),
      [2, 2],
    );
  });
  test(
    'neighbour rule preserves resolution transitions and breaks missing hour',
    () {
      List<ChartPoint> at(List<int> minutes) => [
        for (final m in minutes)
          ChartPoint(t: chartEpoch.add(Duration(minutes: m)), y: 1),
      ];
      expect(segment(at([0, 15, 30, 90, 150, 510, 870])).length, 1);
      expect(segment(at([0, 60, 120, 240, 300, 360])).map((s) => s.length), [
        3,
        3,
      ]);
      expect(segment(at([0, 120, 180])).map((s) => s.length), [1, 2]);
    },
  );
  test('decimation preserves extrema, endpoints and null separators', () {
    final points = fixturePoints(
      List.generate(
        1000,
        (i) => i == 500
            ? null
            : i == 200
            ? 900
            : i == 201
            ? -800
            : 3,
      ),
    );
    final reduced = decimate(points, 10);
    expect(reduced.length, lessThan(100));
    expect(reduced.first, points.first);
    expect(reduced.last, points.last);
    expect(reduced.any((p) => p.y == 900), isTrue);
    expect(reduced.any((p) => p.y == -800), isTrue);
    expect(reduced.where((p) => p.y == null).single, points[500]);
    expect(points.length, 1000);
  });
  for (final theme in AppearanceThemeId.values) {
    for (final b in Brightness.values) {
      test('palette contrast and stable slots: ${theme.name} ${b.name}', () {
        final scheme = AppearanceTheme.colorScheme(
          AppearanceSettings(theme: theme),
          b,
        );
        final palette = AppChartPalette.fromTokens(
          AppearanceTheme.colorTokens(scheme, b),
        );
        expect(palette.slots, hasLength(6));
        for (final surface in [scheme.card, scheme.background]) {
          for (final color in palette.slots) {
            expect(
              AppearanceContrast.ratio(color, surface),
              greaterThanOrEqualTo(3),
            );
          }
          for (final color in [palette.text, palette.mutedText]) {
            expect(
              AppearanceContrast.ratio(color, surface),
              greaterThanOrEqualTo(4.5),
            );
          }
        }
        expect(
          AppChartPalette.fromTokens(
            AppearanceTheme.colorTokens(scheme, b),
          ).slots,
          palette.slots,
        );
      });
    }
  }
  test('validated palette slot source order is fixed', () {
    expect(AppChartPalette.lightSteps.map((c) => c.toARGB32()), [
      0xFF0072B2,
      0xFFA66F00,
      0xFF008A65,
      0xFFC25500,
      0xFFB85C93,
      0xFF2E86BF,
    ]);
    expect(AppChartPalette.darkSteps.map((c) => c.toARGB32()), [
      0xFF0072B2,
      0xFFE69F00,
      0xFF009E73,
      0xFFD55E00,
      0xFFCC79A7,
      0xFF56B4E9,
    ]);
  });
  test('a labeler formats ticks and is told where the day changes', () {
    final times = List.generate(25, (i) => chartEpoch.add(Duration(hours: i)));
    final dates = <bool>[];
    final ticks = chartTimeTicks(
      times,
      1000,
      style: const TextStyle(fontSize: 10),
      labeler: (t, {required date}) {
        dates.add(date);
        return date ? 'day' : 'time';
      },
    );
    expect(ticks.first.label, 'day');
    expect(ticks.where((t) => t.label == 'day'), hasLength(2));
    expect(dates.first, isTrue);
  });
  for (final scale in [1.0, 2.0]) {
    test('GMT+7 midnight and nonoverlapping ticks at $scale', () {
      final times = List.generate(
        25,
        (i) => chartEpoch.add(Duration(hours: i)),
      );
      final ticks = chartTimeTicks(
        times,
        1000,
        style: const TextStyle(fontSize: 10),
        textScaler: TextScaler.linear(scale),
      );
      expect(ticks.first.label, '2026-01-02 23:00');
      expect(ticks.any((t) => t.label.startsWith('2026-01-03')), isTrue);
      for (var i = 1; i < ticks.length; i++) {
        expect(
          ticks[i].rect.left,
          greaterThanOrEqualTo(ticks[i - 1].rect.right + 8),
        );
      }
      expect(
        chartTimeLabel(DateTime.parse('2026-01-02T17:00:00Z'), date: true),
        '2026-01-03 00:00',
      );
    });
  }
  test('line geometry has no null vertex or path through null bucket', () {
    final palette = AppChartPalette.fromTokens(
      AppearanceTheme.colorTokens(
        AppearanceTheme.colorScheme(
          const AppearanceSettings(),
          Brightness.light,
        ),
        Brightness.light,
      ),
    );
    final s = fixtureSeries().first;
    final painter = LinePainter(
      series: [s],
      palette: palette,
      axis: const ChartValueAxis(min: 0, max: 30),
    );
    final c = ChartCanvas(const Size(360, 220), palette);
    final paths = painter.vertices(c, s, s.points.first.t, s.points.last.t);
    final missingX = c.x(s.points[2].t, s.points.first.t, s.points.last.t);
    expect(paths, hasLength(2));
    for (final path in paths) {
      expect(path.every((p) => p.dx != missingX), isTrue);
      expect(path.last.dx < missingX || path.first.dx > missingX, isTrue);
    }
  });
  test('area invalidates incomplete stack without zero-filling any layer', () {
    final series = fixtureSeries();
    final palette = AppChartPalette.fromTokens(
      AppearanceTheme.colorTokens(
        AppearanceTheme.colorScheme(
          const AppearanceSettings(),
          Brightness.light,
        ),
        Brightness.light,
      ),
    );
    final layers = StackedAreaPainter(
      series: series,
      palette: palette,
      axis: const ChartValueAxis(min: 0, max: 30),
    ).boundaries();
    expect(layers.every((layer) => layer[2].y == null), isTrue);
    expect(layers.last.first.y, 17);
  });
  test('squarified tile areas conserve weight and do not overlap', () {
    const bounds = Rect.fromLTWH(0, 0, 360, 220);
    final rects = chartTreemapRects(fixtureTiles, bounds);
    for (var i = 0; i < rects.length; i++) {
      expect(
        rects[i].width * rects[i].height / (360 * 220),
        closeTo(fixtureTiles[i].value / 17, 1e-9),
      );
      for (var j = i + 1; j < rects.length; j++) {
        expect(rects[i].overlaps(rects[j]), isFalse);
      }
    }
  });
  test(
    'matrix transpose preserves missing cells and terminal header hatches',
    () {
      final t = fixtureMatrix.transpose();
      expect(t.cells[1][0].value, isNull);
      expect(t.hatchedRows, {2});
      expect(t.transpose().columns, fixtureMatrix.columns);
    },
  );
  test(
    'signed axis retains negative values and fixed percentages stay fixed',
    () {
      final axis = ChartValueAxis.auto([-12, null, 25], signed: true);
      expect(axis.min, -12);
      expect(axis.max, 25);
      expect(axis.fraction(0), greaterThan(0));
      expect(ChartValueAxis.percent.max, 100);
    },
  );
}
