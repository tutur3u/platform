import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_decimate.dart';
import 'package:mobile/core/ui/charts/chart_gaps.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';

class LinePainter extends ChartPainter {
  const LinePainter({
    required this.series,
    required this.palette,
    required this.axis,
    this.cadence,
    this.bands = const [],
    this.selectedBucket,
    this.selectedSeries = 0,
    this.axes = true,
    this.textScaler = TextScaler.noScaling,
  });
  final List<ChartSeries> series;
  final AppChartPalette palette;
  final ChartValueAxis axis;
  final Duration? cadence;
  final List<ChartBand> bands;
  final int? selectedBucket;
  final int selectedSeries;
  final bool axes;
  final TextScaler textScaler;

  /// Renderer geometry: each path has known vertices only.
  List<List<Offset>> vertices(
    ChartCanvas c,
    ChartSeries s,
    DateTime first,
    DateTime last,
  ) => segment(s.points, cadence: cadence)
      .map(
        (part) => decimate(
          part,
          c.plot.width,
        ).map((p) => Offset(c.x(p.t, first, last), c.y(p.y!, axis))).toList(),
      )
      .toList();

  @override
  void paint(Canvas canvas, Size size) {
    final times =
        series.expand((s) => s.points.map((p) => p.t)).toSet().toList()..sort();
    if (times.isEmpty) return;
    final c = ChartCanvas(size, palette, axes: axes, textScaler: textScaler)
      ..drawAxes(canvas, axis, times);
    canvas
      ..save()
      ..clipRect(c.plot.inflate(5));
    for (final band in bands) {
      final path = Path();
      if (band.t != null) {
        final x = c.x(band.t!, times.first, times.last);
        path
          ..moveTo(x, c.plot.top)
          ..lineTo(x, c.plot.bottom);
        c.label(
          canvas,
          band.label,
          Offset(x + 3, c.plot.top),
          maxWidth: (c.plot.right - x).clamp(1, c.plot.width),
        );
      } else {
        final y = c.y(band.y!, axis);
        path
          ..moveTo(c.plot.left, y)
          ..lineTo(c.plot.right, y);
        c.label(
          canvas,
          band.label,
          Offset(c.plot.left, y - textScaler.scale(12)),
          maxWidth: c.plot.width,
        );
      }
      chartDashedPath(
        canvas,
        path,
        Paint()
          ..color = palette.neutral
          ..style = PaintingStyle.stroke,
      );
    }
    for (var si = 0; si < series.length; si++) {
      final s = series[si];
      final color = c.seriesColor(s);
      final paint = Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;
      for (final points in vertices(c, s, times.first, times.last)) {
        final path = Path()..moveTo(points.first.dx, points.first.dy);
        for (var i = 1; i < points.length; i++) {
          if (s.style == ChartLineStyle.step) {
            path.lineTo(points[i].dx, points[i - 1].dy);
          }
          path.lineTo(points[i].dx, points[i].dy);
        }
        if (s.style == ChartLineStyle.dashed) {
          chartDashedPath(canvas, path, paint);
        } else {
          canvas.drawPath(path, paint);
        }
      }
      for (var i = 0; i < s.points.length; i++) {
        final p = s.points[i];
        if (p.y == null) continue;
        final selected = si == selectedSeries && i == selectedBucket;
        if (s.points.length <= 12 || selected || i == s.points.length - 1) {
          chartMarker(
            canvas,
            Offset(c.x(p.t, times.first, times.last), c.y(p.y!, axis)),
            s.marker,
            color,
            hollow: s.hollow || p.partial || i == s.points.length - 1,
            selected: selected,
            surface: palette.surface,
          );
        }
      }
      drawUnknownBaseline(
        canvas,
        c,
        s.points,
        times.first,
        times.last,
        cadence: cadence,
      );
    }
    canvas.restore();
    if (axes && series.length > 1) {
      for (final s in series) {
        if (s.points.isEmpty || s.points.last.y == null) continue;
        final x = c.x(s.points.last.t, times.first, times.last) + 8;
        if (x >= c.plot.right) continue;
        c.label(
          canvas,
          s.label,
          Offset(x, c.y(s.points.last.y!, axis) - textScaler.scale(14)),
          maxWidth: c.plot.right - x,
        );
      }
    }
  }
}

void drawUnknownBaseline(
  Canvas canvas,
  ChartCanvas c,
  List<ChartPoint> points,
  DateTime first,
  DateTime last, {
  Duration? cadence,
}) {
  if (points.isNotEmpty && points.every((p) => p.y == null)) {
    chartDashedPath(
      canvas,
      Path()
        ..moveTo(c.plot.left, c.plot.bottom)
        ..lineTo(c.plot.right, c.plot.bottom),
      Paint()
        ..color = c.palette.neutral
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );
    return;
  }
  for (var i = 0; i < points.length; i++) {
    if (points[i].y != null && !chartHasGap(points, i, cadence: cadence)) {
      continue;
    }
    final left = c.x(i == 0 ? points[i].t : points[i - 1].t, first, last);
    final right = c.x(
      i + 1 == points.length ? points[i].t : points[i + 1].t,
      first,
      last,
    );
    chartDashedPath(
      canvas,
      Path()
        ..moveTo(left, c.plot.bottom)
        ..lineTo(right, c.plot.bottom),
      Paint()
        ..color = c.palette.neutral
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );
  }
}
