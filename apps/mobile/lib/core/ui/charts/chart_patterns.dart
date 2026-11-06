import 'dart:math' as math;
import 'package:flutter/painting.dart';
import 'package:mobile/core/ui/charts/chart_data.dart';

void chartDashedPath(
  Canvas canvas,
  Path path,
  Paint paint, {
  double dash = 5,
  double gap = 4,
}) {
  for (final metric in path.computeMetrics()) {
    for (var d = 0.0; d < metric.length; d += dash + gap) {
      canvas.drawPath(
        metric.extractPath(d, math.min(d + dash, metric.length)),
        paint,
      );
    }
  }
}

void chartHatch(
  Canvas canvas,
  Path clip,
  Rect bounds,
  Color color,
  ChartPattern pattern,
) {
  if (pattern == ChartPattern.none) return;
  canvas
    ..save()
    ..clipPath(clip);
  final paint = Paint()
    ..color = color
    ..strokeWidth = 1;
  for (
    var x = bounds.left - bounds.height;
    x < bounds.right + bounds.height;
    x += 8
  ) {
    final forward = pattern == ChartPattern.forward;
    canvas.drawLine(
      Offset(x, forward ? bounds.bottom : bounds.top),
      Offset(x + bounds.height, forward ? bounds.top : bounds.bottom),
      paint,
    );
  }
  canvas.restore();
}
