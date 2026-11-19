import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/kanban_task_order.dart';

void main() {
  TaskBoardTask card(String id, int? key) =>
      TaskBoardTask(id: id, listId: 'list', sortKey: key);

  test('a sparse gap uses one placement key', () {
    final cards = [card('a', 1000000), card('b', 2000000)];
    expect(kanbanPlacementKeys(cards, taskId: 'new', index: 1), {
      'new': 1500000,
    });
  });

  test('adjacent sort keys are spaced without changing neighbour order', () {
    final cards = [card('a', 1), card('b', 2), card('c', 1000000)];
    final keys = kanbanPlacementKeys(cards, taskId: 'new', index: 1);

    expect(keys.keys, ['new', 'b']);
    expect(keys['new'], greaterThan(1));
    expect(keys['b'], greaterThan(keys['new']!));
    expect(keys['b'], lessThan(1000000));
  });

  test('unkeyed cards can be ordered after an unkeyed predecessor', () {
    final cards = [card('a', 2000000), card('b', null), card('c', null)];
    final keys = kanbanPlacementKeys(cards, taskId: 'new', index: 2);

    expect(keys.keys, ['b', 'new']);
    expect(keys['b'], greaterThan(2000000));
    expect(keys['new'], greaterThan(keys['b']!));
  });
}
