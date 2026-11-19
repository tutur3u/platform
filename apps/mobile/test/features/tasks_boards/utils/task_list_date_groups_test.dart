import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_list_date_groups.dart';

void main() {
  final now = DateTime(2026, 11, 18, 12);
  const lists = [
    TaskBoardList(id: 'todo', boardId: 'b', name: 'To do'),
  ];

  TaskBoardTask task(
    String id, {
    DateTime? start,
    DateTime? end,
    bool completed = false,
  }) => TaskBoardTask(
    id: id,
    listId: 'todo',
    name: id,
    startDate: start,
    endDate: end,
    completed: completed,
  );

  test('groups tasks into overdue, today, upcoming, and no date', () {
    final groups = buildTaskListDateGroups(
      tasks: [
        task('overdue', end: DateTime(2026, 11, 10)),
        task('today', end: DateTime(2026, 11, 18)),
        task('upcoming', end: DateTime(2026, 11, 25)),
        task('plain'),
      ],
      lists: lists,
      now: now,
    );
    expect(groups.map((g) => g.bucket), [
      TaskListDateBucket.overdue,
      TaskListDateBucket.today,
      TaskListDateBucket.upcoming,
      TaskListDateBucket.noDate,
    ]);
    expect(groups[0].tasks.map((t) => t.id), ['overdue']);
    expect(groups[1].tasks.map((t) => t.id), ['today']);
    expect(groups[2].tasks.map((t) => t.id), ['upcoming']);
    expect(groups[3].tasks.map((t) => t.id), ['plain']);
  });
}