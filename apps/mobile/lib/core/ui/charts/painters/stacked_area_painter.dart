import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_decimate.dart';
import 'package:mobile/core/ui/charts/chart_gaps.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';
import 'package:mobile/core/ui/charts/painters/line_painter.dart';

class StackedAreaPainter extends ChartPainter {
  const StackedAreaPainter({
    required this.series,
    required this.palette,
    required this.axis,
    this.cadence,
    this.selectedBucket,
    this.selectedSeries = 0,
    this.textScaler = TextScaler.noScaling,
  });
  final List<ChartSeries> series;
  final AppChartPalette palette;
  final ChartValueAxis axis;
  final Duration? cadence;
  final int? selectedBucket;
  final int selectedSeries;
  final TextScaler textScaler;

  /// Missing components invalidate that bucket for the whole stack.
  List<List<ChartPoint>> boundaries() {
    final times =
        series.expand((s) => s.points.map((p) => p.t)).toSet().toList()..sort();
    final byTime = series
        .map((s) => {for (final p in s.points) p.t: p})
        .toList();
    final totals = <DateTime, double?>{};
    for (final t in times) {
      totals[t] = byTime.any((s) => s[t]?.y == null) ? null : 0;
    }
    final layers = <List<ChartPoint>>[
      [for (final t in times) ChartPoint(t: t, y: totals[t])],
    ];
    for (final s in byTime) {
      layers.add([
        for (final t in times)
          ChartPoint(
            t: t,
            y: totals[t] == null ? null : (totals[t] = totals[t]! + s[t]!.y!),
            partial: s[t]?.partial ?? false,
          ),
      ]);
    }
    return layers;
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (series.isEmpty) return;
    final layers = boundaries();
    final times = layers.first.map((p) => p.t).toList();
    if (times.isEmpty) return;
    final c = ChartCanvas(size, palette, textScaler: textScaler)
      ..drawAxes(canvas, axis, times);
    canvas
      ..save()
      ..clipRect(c.plot.inflate(5));
    for (var si = 0; si < series.length; si++) {
      final s = series[si];
      final lower = {for (final p in layers[si]) p.t: p.y};
      final color = c.seriesColor(s);
      for (final part in segment(layers[si + 1], cadence: cadence)) {
        final top = decimate(part, c.plot.width);
        // Decimate both boundaries independently to preserve each envelope.
        final bottom = decimate([
          for (final p in part) ChartPoint(t: p.t, y: lower[p.t]),
        ], c.plot.width);
        final path = Path()
          ..moveTo(
            c.x(top.first.t, times.first, times.last),
            c.y(top.first.y!, axis),
          );
        for (final p in top.skip(1)) {
          path.lineTo(c.x(p.t, times.first, times.last), c.y(p.y!, axis));
        }
        for (final p in bottom.reversed) {
          path.lineTo(c.x(p.t, times.first, times.last), c.y(p.y!, axis));
        }
        path.close();
        canvas.drawPath(path, Paint()..color = color.withValues(alpha: 0.25));
        chartHatch(canvas, path, c.plot, color, s.pattern);
        final outline = Paint()
          ..color = color
          ..strokeWidth = 2
          ..style = PaintingStyle.stroke;
        if (s.style == ChartLineStyle.dashed) {
          chartDashedPath(canvas, path, outline);
        } else {
          canvas.drawPath(path, outline);
        }
      }
      for (var i = 0; i < times.length; i++) {
        final p = layers[si + 1][i];
        if (p.y == null) continue;
        final selected = selectedBucket == i && selectedSeries == si;
        if (i == times.length - 1 || p.partial || selected) {
          chartMarker(
            canvas,
            Offset(c.x(p.t, times.first, times.last), c.y(p.y!, axis)),
            s.marker,
            color,
            hollow: true,
            selected: selected,
            surface: palette.surface,
          );
        }
      }
    }
    drawUnknownBaseline(
      canvas,
      c,
      layers.last,
      times.first,
      times.last,
      cadence: cadence,
    );
    canvas.restore();
  }
}
