import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';

void main() {
  group('sortTaskBoardListViewTasks', () {
    final todoA = TaskBoardTask(
      id: 'a',
      listId: 'l1',
      name: 'Alpha',
      priority: 'low',
      createdAt: DateTime(2024, 1, 2),
    );
    const todoB = TaskBoardTask(
      id: 'b',
      listId: 'l1',
      name: 'Beta',
      priority: 'high',
    );
    final doneC = TaskBoardTask(
      id: 'c',
      listId: 'l1',
      name: 'Gamma',
      priority: 'critical',
      createdAt: DateTime(2024, 1, 3),
      closedAt: DateTime(2024, 1, 4),
    );

    test('keeps incomplete tasks before completed tasks', () {
      final sorted = sortTaskBoardListViewTasks(
        [doneC, todoA, todoB],
        (field: 'created_at', ascending: false),
      );

      expect(sorted.map((task) => task.id), ['a', 'b', 'c']);
    });

    test('sorts by priority descending for non-completed tasks', () {
      final sorted = sortTaskBoardListViewTasks(
        [todoA, todoB],
        (field: 'priority', ascending: false),
      );

      expect(sorted.map((task) => task.id), ['b', 'a']);
    });

    test('sorts by name ascending for non-completed tasks', () {
      final sorted = sortTaskBoardListViewTasks(
        [todoB, todoA],
        (field: 'name', ascending: true),
      );

      expect(sorted.map((task) => task.id), ['a', 'b']);
    });
  });
}
