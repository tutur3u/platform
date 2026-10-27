import 'package:flutter/rendering.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_time_axis.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';

class ChartCanvas {
  ChartCanvas(
    this.size,
    this.palette, {
    this.textScaler = TextScaler.noScaling,
    this.axes = true,
  });
  final Size size;
  final AppChartPalette palette;
  final TextScaler textScaler;
  final bool axes;
  Rect get plot => axes
      ? Rect.fromLTRB(
          48,
          16,
          (size.width - 18).clamp(49, double.infinity),
          (size.height - textScaler.scale(24) - 24).clamp(17, double.infinity),
        )
      : (const Offset(6, 6) &
            Size(
              (size.width - 12).clamp(1, double.infinity),
              (size.height - 12).clamp(1, double.infinity),
            ));

  double x(DateTime t, DateTime first, DateTime last) {
    final span = last.difference(first).inMicroseconds;
    return plot.left +
        (span == 0 ? 0.5 : t.difference(first).inMicroseconds / span) *
            plot.width;
  }

  double y(double value, ChartValueAxis axis) =>
      plot.bottom - axis.fraction(value) * plot.height;

  TextPainter label(
    Canvas canvas,
    String text,
    Offset at, {
    double maxWidth = double.infinity,
    bool centered = false,
    Color? color,
  }) {
    final p = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(fontSize: 10, color: color ?? palette.text),
      ),
      textScaler: textScaler,
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth);
    p.paint(canvas, centered ? at - Offset(p.width / 2, 0) : at);
    return p;
  }

  void drawAxes(Canvas canvas, ChartValueAxis axis, List<DateTime> times) {
    if (!axes) return;
    for (var i = 0; i <= 4; i++) {
      final value = axis.min + (axis.max - axis.min) * i / 4;
      final dy = y(value, axis);
      canvas.drawLine(
        Offset(plot.left, dy),
        Offset(plot.right, dy),
        Paint()..color = palette.grid,
      );
      label(canvas, axis.label(value), Offset(0, dy - 5), maxWidth: 44);
    }
    if (axis.min < 0 && axis.max > 0) {
      canvas.drawLine(
        Offset(plot.left, y(0, axis)),
        Offset(plot.right, y(0, axis)),
        Paint()
          ..color = palette.neutral
          ..strokeWidth = 1.5,
      );
    }
    final ticks = chartTimeTicks(
      times,
      plot.width,
      style: TextStyle(fontSize: 10, color: palette.mutedText),
      textScaler: textScaler,
    );
    for (final tick in ticks) {
      label(
        canvas,
        tick.label,
        Offset(plot.left + tick.rect.left, plot.bottom + 6),
        maxWidth: tick.rect.width,
      );
    }
    label(
      canvas,
      'GMT+7',
      Offset(
        plot.right - textScaler.scale(35),
        size.height - textScaler.scale(12),
      ),
      color: palette.mutedText,
    );
  }

  Color seriesColor(ChartSeries series) => series.tone == null
      ? palette.slots[series.slot]
      : palette.tone(series.tone!);
}

abstract class ChartPainter extends CustomPainter {
  const ChartPainter();
  @override
  bool shouldRepaint(covariant ChartPainter oldDelegate) => true;
}
