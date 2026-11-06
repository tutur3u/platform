import 'dart:math' as math;
import 'package:mobile/core/ui/charts/chart_data.dart';

bool chartHasGap(List<ChartPoint> points, int right, {Duration? cadence}) {
  if (right <= 0 || right >= points.length) return false;
  final delta = points[right].t.difference(points[right - 1].t).inMicroseconds;
  if (cadence != null) return delta > cadence.inMicroseconds;
  final neighbours = <int>[
    if (right > 1)
      points[right - 1].t.difference(points[right - 2].t).inMicroseconds,
    if (right + 1 < points.length)
      points[right + 1].t.difference(points[right].t).inMicroseconds,
  ];
  return neighbours.isNotEmpty && delta >= 1.5 * neighbours.reduce(math.max);
}

List<List<ChartPoint>> segment(List<ChartPoint> points, {Duration? cadence}) {
  final result = <List<ChartPoint>>[];
  var current = <ChartPoint>[];
  for (var i = 0; i < points.length; i++) {
    final point = i == points.length - 1 ? points[i].asPartial() : points[i];
    if (point.y == null || chartHasGap(points, i, cadence: cadence)) {
      if (current.isNotEmpty) result.add(List.unmodifiable(current));
      current = [];
    }
    if (point.y != null) current.add(point);
  }
  if (current.isNotEmpty) result.add(List.unmodifiable(current));
  return List.unmodifiable(result);
}
