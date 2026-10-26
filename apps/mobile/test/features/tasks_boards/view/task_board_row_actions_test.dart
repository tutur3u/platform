import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';

import 'task_board_row_actions_fixture.dart';

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late RowActionsRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = RowActionsRepository();
  });

  Future<void> pumpBoard(WidgetTester tester) => pumpRowActionsBoard(
    tester,
    workspaceCubit: workspaceCubit,
    repository: repository,
  );

  TaskBoardDetailCubit readCubit(WidgetTester tester) =>
      readRowActionsCubit(tester);

  Finder row(String title) => taskRow(title);

  testWidgets('swiping a row toward the end completes it', (tester) async {
    await pumpBoard(tester);

    await tester.drag(row('Alpha task'), const Offset(300, 0));
    await tester.pumpAndSettle();

    expect(repository.moves, ['task-1->list-2']);
  });

  testWidgets('swiping toward the start reveals schedule, priority, delete', (
    tester,
  ) async {
    await pumpBoard(tester);

    await tester.drag(row('Alpha task'), const Offset(-320, 0));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('task-row-swipe-schedule')), findsOne);
    expect(find.byKey(const ValueKey('task-row-swipe-priority')), findsOne);
    await tester.tap(find.byKey(const ValueKey('task-row-swipe-delete')));
    await tester.pumpAndSettle();

    // The shared async confirmation keeps the destructive step explicit.
    expect(find.text('Delete task?'), findsOneWidget);
    expect(repository.deletes, isEmpty);
    await tester.tap(find.text('Delete task').last);
    await tester.pump();

    expect(repository.deletes, ['task-1']);
    // The confirmation stays busy for the whole mutation, including the
    // cache invalidation that follows the request.
    expect(find.text('Delete task?'), findsOneWidget);
  });

  testWidgets('the swipe priority action saves the picked priority', (
    tester,
  ) async {
    await pumpBoard(tester);

    await tester.drag(row('Beta task'), const Offset(-320, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('task-row-swipe-priority')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('task-row-priority-high')));
    await tester.pumpAndSettle();

    expect(repository.updates.single.taskId, 'task-2');
    expect(repository.updates.single.priority, 'high');
  });

  testWidgets('long press opens the context menu with every row action', (
    tester,
  ) async {
    await pumpBoard(tester);

    await tester.longPress(find.text('Alpha task').first);
    await tester.pumpAndSettle();

    for (final label in [
      'Complete',
      'Start focus',
      'Schedule',
      'Change priority',
      'Move task',
      'Select task',
      'Open full details',
      'Delete task',
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(readCubit(tester).state.isBulkSelectMode, isFalse);

    await tester.tap(find.text('Complete'));
    await tester.pumpAndSettle();
    expect(repository.moves, ['task-1->list-2']);
  });

  testWidgets('menu Select enters bulk mode, which disables swipes', (
    tester,
  ) async {
    await pumpBoard(tester);

    await tester.longPress(find.text('Alpha task').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select task'));
    await tester.pumpAndSettle();

    final cubit = readCubit(tester);
    expect(cubit.state.isBulkSelectMode, isTrue);
    expect(cubit.state.selectedTaskIds, {'task-1'});

    await tester.drag(row('Beta task'), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(repository.moves, isEmpty);

    // In bulk mode a long press keeps toggling selection.
    await tester.longPress(find.text('Beta task').first);
    await tester.pumpAndSettle();
    expect(cubit.state.selectedTaskIds, {'task-1', 'task-2'});
  });

  testWidgets('rows and the menu fit a small phone at 2x text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 568)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpBoard(tester);

    await tester.drag(row('Beta task'), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final delete = tester.getSize(
      find.byKey(const ValueKey('task-row-swipe-delete')),
    );
    expect(delete.width, greaterThanOrEqualTo(44));
    expect(delete.height, greaterThanOrEqualTo(44));

    // Tapping the visible part of an open row closes it.
    await tester.tapAt(
      tester.getTopLeft(row('Beta task')) + const Offset(8, 20),
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Beta task').first).dx, greaterThan(0));

    await tester.longPress(find.text('Beta task').first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      find.byKey(const ValueKey('task-row-menu-toggle-done')),
      findsOneWidget,
    );
  });
}
