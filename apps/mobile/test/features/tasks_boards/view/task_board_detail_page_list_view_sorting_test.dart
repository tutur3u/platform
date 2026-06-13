import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_list.dart';
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
      const normal = TaskBoardTask(
        id: 'normal',
        listId: 'l1',
        name: 'Normal',
        priority: 'normal',
      );
      const unprioritized = TaskBoardTask(
        id: 'none',
        listId: 'l1',
        name: 'None',
      );
      final sorted = sortTaskBoardListViewTasks(
        [unprioritized, todoA, normal, todoB, doneC],
        (field: 'priority', ascending: false),
      );

      expect(sorted.map((task) => task.id), ['b', 'normal', 'a', 'none', 'c']);
    });

    test('sorts by name ascending for non-completed tasks', () {
      final sorted = sortTaskBoardListViewTasks(
        [todoB, todoA],
        (field: 'name', ascending: true),
      );

      expect(sorted.map((task) => task.id), ['a', 'b']);
    });

    test('sorts done tasks by completed_at descending', () {
      const doneList = TaskBoardList(
        id: 'done',
        boardId: 'board',
        status: 'done',
      );
      final older = TaskBoardTask(
        id: 'older',
        listId: 'done',
        completedAt: DateTime(2024, 1, 2),
      );
      final newer = TaskBoardTask(
        id: 'newer',
        listId: 'done',
        completedAt: DateTime(2024, 1, 3),
      );

      final sorted = sortTaskBoardListViewTasksForList(doneList, [
        older,
        newer,
      ]);

      expect(sorted.map((task) => task.id), ['newer', 'older']);
    });

    test('sorts closed tasks by closed_at descending', () {
      const closedList = TaskBoardList(
        id: 'closed',
        boardId: 'board',
        status: 'closed',
      );
      final older = TaskBoardTask(
        id: 'older',
        listId: 'closed',
        closedAt: DateTime(2024, 1, 2),
      );
      final newer = TaskBoardTask(
        id: 'newer',
        listId: 'closed',
        closedAt: DateTime(2024, 1, 3),
      );

      final sorted = sortTaskBoardListViewTasksForList(closedList, [
        older,
        newer,
      ]);

      expect(sorted.map((task) => task.id), ['newer', 'older']);
    });
  });
}
