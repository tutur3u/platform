import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_value_axis.dart';

class ChartValueTick {
  const ChartValueTick(this.value, this.painter, this.rect);
  final double value;
  final TextPainter painter;
  final Rect rect;
}

/// Measured value labels and the plot they reserve, shared with hit testing.
class ChartValueLayout {
  ChartValueLayout({
    required Size size,
    required ChartValueAxis axis,
    required Color color,
    TextScaler textScaler = TextScaler.noScaling,
    bool horizontal = false,
  }) {
    final values = <double>{
      axis.min,
      axis.max,
      for (var i = 1; i < 4; i++) axis.min + (axis.max - axis.min) * i / 4,
      if (axis.min <= 0 && axis.max >= 0) 0,
    }.toList()..sort();
    TextPainter measure(double value, double fit) => TextPainter(
      text: TextSpan(
        text: axis.label(value),
        style: TextStyle(fontSize: 10 * fit, color: color),
      ),
      textScaler: textScaler,
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    final natural = [for (final v in values) measure(v, 1)];
    final widest = natural.map((p) => p.width).reduce(math.max);
    final budget = math.min(160, size.width * (horizontal ? 0.3 : 0.45));
    var fit = widest > budget ? budget / widest : 1.0;
    if (horizontal) {
      final zero = values.indexOf(0);
      final middleWidth = zero > 0 && zero < values.length - 1
          ? natural[zero].width
          : 0.0;
      final requiredWidth =
          natural.first.width / 2 + middleWidth + natural.last.width;
      // Reserve space for all mandatory labels before trying optional ticks.
      fit = math.min(fit, (size.width * 0.68 - 24) / requiredWidth);
    }
    final painters = [for (final v in values) measure(v, fit)];
    for (final p in natural) {
      p.dispose();
    }
    final width = painters.map((p) => p.width).reduce(math.max);
    final height = painters.map((p) => p.height).reduce(math.max);
    plot = horizontal
        ? Rect.fromLTRB(
            math.max(size.width * 0.32, painters.first.width / 2 + 8),
            16,
            size.width - math.max(12, painters.last.width / 2 + 8),
            size.height - height - 8,
          )
        : Rect.fromLTRB(
            math.max(48, width + 12),
            math.max(16, height / 2 + 4),
            size.width - 18,
            size.height - textScaler.scale(24) - 24,
          );
    Rect rectFor(int i) {
      final p = painters[i];
      final fraction = axis.fraction(values[i]);
      return horizontal
          ? Rect.fromLTWH(
              plot.left + fraction * plot.width - p.width / 2,
              plot.bottom + 4,
              p.width,
              p.height,
            )
          : Rect.fromLTWH(
              plot.left - 12 - p.width,
              plot.bottom - fraction * plot.height - p.height / 2,
              p.width,
              p.height,
            );
    }

    final rects = [for (var i = 0; i < values.length; i++) rectFor(i)];
    final mandatory = <int>{
      0,
      values.length - 1,
      if (values.contains(0)) values.indexOf(0),
    };
    final ordered = mandatory.toList()
      ..sort(
        (a, b) => horizontal
            ? rects[a].center.dx.compareTo(rects[b].center.dx)
            : rects[a].center.dy.compareTo(rects[b].center.dy),
      );
    // Retain endpoints and zero; move a near-end zero label into free space.
    if (ordered.length == 3) {
      final before = rects[ordered.first];
      final after = rects[ordered.last];
      final index = ordered[1];
      final r = rects[index];
      final low = horizontal
          ? before.right + 8 + r.width / 2
          : before.bottom + 8 + r.height / 2;
      final high = horizontal
          ? after.left - 8 - r.width / 2
          : after.top - 8 - r.height / 2;
      if (low <= high) {
        final center = horizontal ? r.center.dx : r.center.dy;
        final shift = center.clamp(low, high) - center;
        rects[index] = r.shift(
          horizontal ? Offset(shift, 0) : Offset(0, shift),
        );
      }
    }
    final selected = <int>{...mandatory};
    final optional =
        [
          for (var i = 1; i < values.length - 1; i++)
            if (!mandatory.contains(i)) i,
        ]..sort(
          (a, b) => (a - values.length ~/ 2).abs().compareTo(
            (b - values.length ~/ 2).abs(),
          ),
        );
    for (final i in optional) {
      if (selected.every(
        (j) => !rects[i].inflate(4).overlaps(rects[j].inflate(4)),
      )) {
        selected.add(i);
      }
    }
    ticks = [
      for (var i = 0; i < values.length; i++)
        if (selected.contains(i))
          ChartValueTick(values[i], painters[i], rects[i]),
    ];
    for (var i = 0; i < painters.length; i++) {
      if (!selected.contains(i)) painters[i].dispose();
    }
  }

  late final Rect plot;
  late final List<ChartValueTick> ticks;

  void dispose() {
    for (final tick in ticks) {
      tick.painter.dispose();
    }
  }
}
