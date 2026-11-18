import 'package:flutter/rendering.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';

/// The body's day grid: a hairline between columns, a filled today column
/// and a vertical line through today. One paint call, no per-column widgets.
class TaskTimelineGridPainter extends CustomPainter {
  const TaskTimelineGridPainter({
    required this.metrics,
    required this.todayColumn,
    required this.lineColor,
    required this.todayFill,
    required this.todayLine,
  });

  final TaskTimelineMetrics metrics;

  /// Today's column, or null when the window does not hold today.
  final int? todayColumn;
  final Color lineColor;
  final Color todayFill;
  final Color todayLine;

  @override
  void paint(Canvas canvas, Size size) {
    final today = todayColumn;
    if (today != null) {
      canvas.drawRect(
        Rect.fromLTWH(metrics.left(today), 0, metrics.columnWidth, size.height),
        Paint()..color = todayFill,
      );
    }
    final grid = Paint()
      ..color = lineColor
      ..strokeWidth = 1;
    for (var column = 0; column <= metrics.days; column++) {
      final x = metrics.left(column).roundToDouble() + 0.5;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    if (today != null) {
      final x = metrics.centre(today);
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        Paint()
          ..color = todayLine
          ..strokeWidth = 1.5,
      );
    }
  }

  @override
  bool shouldRepaint(TaskTimelineGridPainter oldDelegate) =>
      oldDelegate.metrics != metrics ||
      oldDelegate.todayColumn != todayColumn ||
      oldDelegate.lineColor != lineColor ||
      oldDelegate.todayFill != todayFill ||
      oldDelegate.todayLine != todayLine;
}
