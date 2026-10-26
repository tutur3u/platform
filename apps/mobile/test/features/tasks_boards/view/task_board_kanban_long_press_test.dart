import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import 'task_board_row_actions_fixture.dart';

/// Adds a board member and records the assignees each update sends.
class _KanbanRepository extends RowActionsRepository {
  final List<List<String>?> assigneeUpdates = [];

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    final detail = await super.getTaskBoardDetail(wsId, boardId);
    return detail.copyWith(
      members: const [WorkspaceUserOption(id: 'user-1', displayName: 'Lan')],
    );
  }

  @override
  Future<TaskBoardTask> updateBoardTask({
    required String wsId,
    required String taskId,
    String? name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
    bool? completed,
    bool clearDescription = false,
    bool clearStartDate = false,
    bool clearEndDate = false,
    bool clearEstimationPoints = false,
  }) {
    assigneeUpdates.add(assigneeIds);
    return super.updateBoardTask(
      wsId: wsId,
      taskId: taskId,
      name: name,
      priority: priority,
      endDate: endDate,
      assigneeIds: assigneeIds,
    );
  }
}

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late _KanbanRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = _KanbanRepository();
  });

  /// Pumps the board on a phone-sized window and switches it to Kanban.
  Future<void> pumpKanban(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pumpRowActionsBoard(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
    );
    readRowActionsCubit(tester).setView(TaskBoardDetailView.kanban);
    await tester.pumpAndSettle();
  }

  Future<void> openMenu(WidgetTester tester, String title) async {
    await tester.longPress(find.text(title).first);
    await tester.pumpAndSettle();
  }

  TaskBoardTask taskIn(TaskBoardDetailCubit cubit, String taskId) =>
      cubit.state.board!.tasks.firstWhere((task) => task.id == taskId);

  testWidgets('a long press on a card opens the shared task menu', (
    tester,
  ) async {
    await pumpKanban(tester);

    await openMenu(tester, 'Alpha task');

    expect(find.text('Move task'), findsOneWidget);
    expect(find.text('Select task'), findsOneWidget);
    expect(find.byKey(const ValueKey('task-row-menu-focus')), findsOneWidget);
    expect(find.byKey(const ValueKey('task-row-menu-assign')), findsOneWidget);
    expect(readRowActionsCubit(tester).state.isBulkSelectMode, isFalse);
  });

  testWidgets('Select enters selection mode; long press then toggles', (
    tester,
  ) async {
    await pumpKanban(tester);

    await openMenu(tester, 'Alpha task');
    await tester.tap(find.text('Select task'));
    await tester.pumpAndSettle();

    final cubit = readRowActionsCubit(tester);
    expect(cubit.state.isBulkSelectMode, isTrue);
    expect(cubit.state.selectedTaskIds, {'task-1'});

    await tester.longPress(find.text('Beta task').first);
    await tester.pumpAndSettle();

    expect(find.text('Move task'), findsNothing);
    expect(cubit.state.selectedTaskIds, {'task-1', 'task-2'});
  });

  testWidgets('moving from the menu puts the card in the target column', (
    tester,
  ) async {
    await pumpKanban(tester);

    final cubit = readRowActionsCubit(tester);
    await openMenu(tester, 'Alpha task');
    await tester.tap(find.text('Move task'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done').last);
    await tester.pumpAndSettle();

    expect(repository.moves, ['task-1->list-2']);
    expect(taskIn(cubit, 'task-1').listId, 'list-2');
    expect(
      cubit.state.listTasksByListId['list-1']!.map((task) => task.id),
      isNot(contains('task-1')),
    );
    await drainToasts(tester);
  });

  testWidgets('a failed move rolls the card back and shows the error', (
    tester,
  ) async {
    repository.moveError = const ApiException(
      message: 'Move rejected',
      statusCode: 409,
    );
    await pumpKanban(tester);

    final cubit = readRowActionsCubit(tester);
    await openMenu(tester, 'Alpha task');
    await tester.tap(find.text('Move task'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done').last);
    await tester.pumpAndSettle();

    expect(find.text('Move rejected'), findsOneWidget);
    expect(repository.moves, isEmpty);
    expect(taskIn(cubit, 'task-1').listId, 'list-1');
    await drainToasts(tester);
  });

  testWidgets('Assignees saves the picked members through the update', (
    tester,
  ) async {
    await pumpKanban(tester);

    final cubit = readRowActionsCubit(tester);
    await openMenu(tester, 'Alpha task');
    await tester.tap(find.byKey(const ValueKey('task-row-menu-assign')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lan').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(repository.assigneeUpdates, [
      ['user-1'],
    ]);
    expect(taskIn(cubit, 'task-1').assigneeIds, ['user-1']);
    await drainToasts(tester);
  });

  testWidgets('a failed assignment keeps the old assignees', (tester) async {
    repository.updateError = const ApiException(
      message: 'Assign rejected',
      statusCode: 403,
    );
    await pumpKanban(tester);

    final cubit = readRowActionsCubit(tester);
    await openMenu(tester, 'Alpha task');
    await tester.tap(find.byKey(const ValueKey('task-row-menu-assign')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lan').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Assign rejected'), findsOneWidget);
    expect(taskIn(cubit, 'task-1').assigneeIds, isEmpty);
    await drainToasts(tester);
  });

  testWidgets('a personal workspace menu offers no Assignees action', (
    tester,
  ) async {
    const personal = Workspace(id: 'ws-1', name: 'Personal', personal: true);
    workspaceCubit = RowActionsWorkspaceCubit();
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: personal,
        workspaces: [personal],
      ),
    );
    await pumpKanban(tester);

    await openMenu(tester, 'Alpha task');

    expect(find.text('Move task'), findsOneWidget);
    expect(find.byKey(const ValueKey('task-row-menu-assign')), findsNothing);
  });
}
