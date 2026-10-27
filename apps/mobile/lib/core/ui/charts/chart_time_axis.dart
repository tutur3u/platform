import 'package:flutter/painting.dart';

DateTime chartLocalTime(DateTime t) => t.toUtc().add(const Duration(hours: 7));

String chartTimeLabel(DateTime t, {bool date = false}) {
  final local = chartLocalTime(t);
  String pad(int n) => n.toString().padLeft(2, '0');
  final time = '${pad(local.hour)}:${pad(local.minute)}';
  return date
      ? '${local.year}-${pad(local.month)}-${pad(local.day)} $time'
      : time;
}

class ChartTimeTick {
  const ChartTimeTick(this.t, this.label, this.rect);
  final DateTime t;
  final String label;
  final Rect rect;
}

List<ChartTimeTick> chartTimeTicks(
  List<DateTime> times,
  double width, {
  required TextStyle style,
  TextScaler textScaler = TextScaler.noScaling,
}) {
  if (times.isEmpty || width <= 0) return [];
  final result = <ChartTimeTick>[];
  final span = times.last.difference(times.first).inMicroseconds;
  DateTime? previous;
  var lastRight = -8.0;
  for (final time in times) {
    final local = chartLocalTime(time);
    final showDate =
        previous == null ||
        local.year != previous.year ||
        local.month != previous.month ||
        local.day != previous.day;
    final label = chartTimeLabel(time, date: showDate);
    final painter = TextPainter(
      text: TextSpan(text: label, style: style),
      textDirection: TextDirection.ltr,
      textScaler: textScaler,
    )..layout();
    final x = span == 0
        ? 0.0
        : time.difference(times.first).inMicroseconds / span * width;
    final left = (x - painter.width / 2).clamp(
      0.0,
      (width - painter.width).clamp(0.0, width),
    );
    if (painter.width <= width && left >= lastRight + 8) {
      final rect = Rect.fromLTWH(left, 0, painter.width, painter.height);
      result.add(ChartTimeTick(time, label, rect));
      lastRight = rect.right;
      previous = local;
    }
  }
  return result;
}
