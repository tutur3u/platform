import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_lane_packing.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';

TaskTimelineBar bar(String id, int first, int last) => TaskTimelineBar(
  task: TaskBoardTask(id: id, listId: 'l', name: id),
  start: DateTime(2026, 1, first + 1),
  end: DateTime(2026, 1, last + 1),
  firstColumn: first,
  lastColumn: last,
);

void main() {
  test('packs non-overlapping bars into one lane', () {
    final lanes = packTaskTimelineBarsIntoLanes([
      bar('a', 0, 1),
      bar('b', 3, 4),
    ]);
    expect(lanes.length, 1);
    expect(lanes.single.length, 2);
  });

  test('uses a second lane when bars overlap', () {
    final lanes = packTaskTimelineBarsIntoLanes([
      bar('a', 0, 2),
      bar('b', 2, 4),
    ]);
    expect(lanes.length, 2);
  });
}
