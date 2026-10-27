import 'package:mobile/core/ui/charts/chart_data.dart';

/// Drawing-only envelope; callers segment first so no null or gap is bridged.
List<ChartPoint> decimate(List<ChartPoint> points, double width) {
  if (points.length <= width * 2 || points.length < 3 || width < 1) {
    return points;
  }
  final first = points.first.t.microsecondsSinceEpoch;
  final span = points.last.t.microsecondsSinceEpoch - first;
  if (span == 0) return points;
  final result = <ChartPoint>[];
  var column = -1;
  var bucket = <ChartPoint>[];
  void flush() {
    if (bucket.isEmpty) return;
    if (bucket.any((p) => p.y == null)) {
      result.addAll(bucket);
    } else {
      final min = bucket.reduce((a, b) => a.y! <= b.y! ? a : b);
      final max = bucket.reduce((a, b) => a.y! >= b.y! ? a : b);
      final selected = {bucket.first, min, max, bucket.last}.toList()
        ..sort((a, b) => a.t.compareTo(b.t));
      result.addAll(selected);
    }
    bucket = [];
  }

  for (final point in points) {
    if (point.y == null) {
      flush();
      result.add(point);
      column = -1;
      continue;
    }
    final next = ((point.t.microsecondsSinceEpoch - first) / span * width)
        .floor();
    if (next != column) flush();
    column = next;
    bucket.add(point);
  }
  flush();
  return result;
}
