import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';

bool timelineBarsOverlap(TaskTimelineBar a, TaskTimelineBar b) {
  return a.firstColumn <= b.lastColumn && b.firstColumn <= a.lastColumn;
}

/// Packs non-overlapping [bars] into horizontal lanes (fewer rows).
List<List<TaskTimelineBar>> packTaskTimelineBarsIntoLanes(
  List<TaskTimelineBar> bars,
) {
  if (bars.isEmpty) return const [];

  final lanes = <List<TaskTimelineBar>>[];
  for (final bar in bars) {
    var placed = false;
    for (final lane in lanes) {
      final overlaps = lane.any(
        (existing) => timelineBarsOverlap(existing, bar),
      );
      if (!overlaps) {
        lane.add(bar);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.add([bar]);
    }
  }
  return lanes;
}
