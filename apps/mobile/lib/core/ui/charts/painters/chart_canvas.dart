import 'package:flutter/rendering.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';
import 'package:mobile/core/ui/charts/chart_palette.dart';
import 'package:mobile/core/ui/charts/chart_time_axis.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';
import 'package:mobile/core/ui/charts/chart_value_layout.dart';

abstract interface class ChartBucketGeometry {
  List<double> bucketPositions(Size size);
}

List<DateTime> chartSeriesTimes(List<ChartSeries> series) =>
    series.expand((s) => s.points.map((p) => p.t)).toSet().toList()..sort();

class ChartCanvas {
  ChartCanvas(
    this.size,
    this.palette, {
    this.textScaler = TextScaler.noScaling,
    this.axes = true,
    this.axis = ChartValueAxis.percent,
    this.horizontal = false,
    this.timeLabel,
  });
  final Size size;
  final AppChartPalette palette;
  final TextScaler textScaler;
  final bool axes;
  final ChartValueAxis axis;
  final bool horizontal;

  /// Formats the x-axis ticks; null keeps [chartTimeLabel].
  final ChartTimeLabeler? timeLabel;
  late final valueLayout = ChartValueLayout(
    size: size,
    axis: axis,
    color: palette.text,
    textScaler: textScaler,
    horizontal: horizontal,
  );
  Rect get plot => axes
      ? valueLayout.plot
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

  void drawValueAxis(Canvas canvas) {
    if (!axes) return;
    for (final tick in valueLayout.ticks) {
      final at = horizontal
          ? plot.left + axis.fraction(tick.value) * plot.width
          : y(tick.value, axis);
      if (tick.value != 0) {
        canvas.drawLine(
          horizontal ? Offset(at, plot.top) : Offset(plot.left, at),
          horizontal ? Offset(at, plot.bottom) : Offset(plot.right, at),
          Paint()..color = palette.grid,
        );
      }
      tick.painter.paint(canvas, tick.rect.topLeft);
    }
    if (axis.min <= 0 && axis.max >= 0) {
      final at = horizontal
          ? plot.left + axis.fraction(0) * plot.width
          : y(0, axis);
      canvas.drawLine(
        horizontal ? Offset(at, plot.top) : Offset(plot.left, at),
        horizontal ? Offset(at, plot.bottom) : Offset(plot.right, at),
        Paint()
          ..color = palette.neutral
          ..strokeWidth = 1.5,
      );
    }
  }

  void drawAxes(Canvas canvas, List<DateTime> times) {
    if (!axes) return;
    drawValueAxis(canvas);
    final ticks = chartTimeTicks(
      times,
      plot.width,
      style: TextStyle(fontSize: 10, color: palette.mutedText),
      textScaler: textScaler,
      labeler: timeLabel,
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

  void dispose() {
    if (axes) valueLayout.dispose();
  }
}

abstract class ChartPainter extends CustomPainter {
  const ChartPainter();
  @override
  bool shouldRepaint(covariant ChartPainter oldDelegate) => true;
}
