import 'package:flutter/painting.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_markers.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_patterns.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';
import 'package:mobile/core/ui/charts/painters/chart_canvas.dart';

class StackedBarPainter extends ChartPainter {
  const StackedBarPainter({
    required this.categories,
    required this.series,
    required this.palette,
    required this.axis,
    this.horizontal = false,
    this.diverging = false,
    this.selectedBucket,
    this.selectedSeries = 0,
    this.textScaler = TextScaler.noScaling,
  });
  final List<ChartCategoryValue> categories;
  final List<ChartSeries> series;
  final AppChartPalette palette;
  final ChartValueAxis axis;
  final bool horizontal;
  final bool diverging;
  final int? selectedBucket;
  final int selectedSeries;
  final TextScaler textScaler;

  @override
  void paint(Canvas canvas, Size size) {
    if (categories.isEmpty) return;
    final c = ChartCanvas(size, palette, textScaler: textScaler);
    final plot = horizontal
        ? Rect.fromLTRB(
            size.width * 0.32,
            16,
            size.width - 12,
            size.height - 32,
          )
        : c.plot;
    double valuePosition(double v) => horizontal
        ? plot.left + axis.fraction(v) * plot.width
        : plot.bottom - axis.fraction(v) * plot.height;
    for (var tick = 0; tick <= 4; tick++) {
      final value = axis.min + (axis.max - axis.min) * tick / 4;
      final at = valuePosition(value);
      canvas.drawLine(
        horizontal ? Offset(at, plot.top) : Offset(plot.left, at),
        horizontal ? Offset(at, plot.bottom) : Offset(plot.right, at),
        Paint()..color = value == 0 ? palette.neutral : palette.grid,
      );
      c.label(
        canvas,
        axis.label(value),
        horizontal ? Offset(at - 8, plot.bottom + 4) : Offset(0, at - 5),
        maxWidth: horizontal ? 48 : 44,
      );
    }
    final stride = (horizontal ? plot.height : plot.width) / categories.length;
    for (var i = 0; i < categories.length; i++) {
      final category = categories[i];
      final incomplete = category.values.any((value) => value == null);
      var positive = 0.0;
      var negative = 0.0;
      for (
        var si = 0;
        si < category.values.length && si < series.length;
        si++
      ) {
        final value = category.values[si];
        if (incomplete || value == null) continue;
        final start = value < 0 ? negative : positive;
        final end = start + value;
        if (value < 0) {
          negative = end;
        } else {
          positive = end;
        }
        final a = valuePosition(start);
        final b = valuePosition(end);
        final low = a < b ? a : b;
        final high = a > b ? a : b;
        final rect = horizontal
            ? Rect.fromLTRB(
                low,
                plot.top + stride * (i + 0.15),
                high,
                plot.top + stride * (i + 0.85),
              )
            : Rect.fromLTRB(
                plot.left + stride * (i + 0.15),
                low,
                plot.left + stride * (i + 0.85),
                high,
              );
        if (rect.isEmpty) continue;
        final s = series[si];
        final color = diverging
            ? palette.tone(value > 0 ? AppTone.warning : AppTone.neutral)
            : c.seriesColor(s);
        const radius = Radius.circular(4);
        final roundStart = value < 0;
        final shape = horizontal
            ? RRect.fromRectAndCorners(
                rect,
                topLeft: roundStart ? radius : Radius.zero,
                bottomLeft: roundStart ? radius : Radius.zero,
                topRight: roundStart ? Radius.zero : radius,
                bottomRight: roundStart ? Radius.zero : radius,
              )
            : RRect.fromRectAndCorners(
                rect,
                topLeft: roundStart ? Radius.zero : radius,
                topRight: roundStart ? Radius.zero : radius,
                bottomLeft: roundStart ? radius : Radius.zero,
                bottomRight: roundStart ? radius : Radius.zero,
              );
        canvas.drawRRect(shape, Paint()..color = color);
        chartHatch(
          canvas,
          Path()..addRRect(shape),
          rect,
          palette.surface,
          s.pattern,
        );
        if (start != 0) {
          canvas.drawLine(
            horizontal ? Offset(a, rect.top) : Offset(rect.left, a),
            horizontal ? Offset(a, rect.bottom) : Offset(rect.right, a),
            Paint()
              ..color = palette.surface
              ..strokeWidth = 2,
          );
        }
        if (diverging || (i == selectedBucket && si == selectedSeries)) {
          chartMarker(
            canvas,
            horizontal ? Offset(b, rect.center.dy) : Offset(rect.center.dx, b),
            diverging
                ? (value < 0
                      ? ChartMarker.triangleDown
                      : ChartMarker.triangleUp)
                : s.marker,
            palette.neutral,
            selected: i == selectedBucket && si == selectedSeries,
            hollow: true,
            surface: palette.surface,
          );
        }
      }
      if (incomplete) {
        final at = plot.left + stride * (i + 0.5);
        chartDashedPath(
          canvas,
          Path()..addRect(
            horizontal
                ? Rect.fromLTWH(
                    plot.left,
                    plot.top + stride * i,
                    8,
                    stride * 0.7,
                  )
                : Rect.fromLTWH(
                    at - stride * 0.3,
                    plot.bottom - 8,
                    stride * 0.6,
                    8,
                  ),
          ),
          Paint()
            ..color = palette.neutral
            ..style = PaintingStyle.stroke,
        );
      }
      c.label(
        canvas,
        category.label,
        horizontal
            ? Offset(0, plot.top + stride * i)
            : Offset(plot.left + stride * i, plot.bottom + 6),
        maxWidth: horizontal ? plot.left - 8 : stride - 4,
      );
    }
  }
}
