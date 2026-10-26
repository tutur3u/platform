import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

/// Records the row mutations; reads return a fixed two-list board.
class _RowActionsRepository extends TaskRepository {
  final List<String> moves = [];
  final List<String> deletes = [];
  final List<({String taskId, String? priority, DateTime? endDate})> updates =
      [];

  static const _detail = TaskBoardDetail(
    id: 'board-1',
    wsId: 'ws-1',
    name: 'Board A',
    lists: [
      TaskBoardList(
        id: 'list-1',
        boardId: 'board-1',
        name: 'Todo',
        status: 'active',
        color: 'BLUE',
      ),
      TaskBoardList(
        id: 'list-2',
        boardId: 'board-1',
        name: 'Done',
        status: 'done',
        color: 'GREEN',
      ),
    ],
    tasks: [
      TaskBoardTask(id: 'task-1', listId: 'list-1', name: 'Alpha task'),
      TaskBoardTask(id: 'task-2', listId: 'list-1', name: 'Beta task'),
    ],
  );

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async => _detail;

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    if (offset > 0) return const <TaskBoardTask>[];
    return _detail.tasks
        .where((task) => task.listId == listId)
        .toList(growable: false);
  }

  @override
  Future<TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
  }) async =>
      const TaskBoardsPage(boards: [], totalCount: 0, page: 1, pageSize: 20);

  @override
  Future<TaskBoardTask> moveBoardTask({
    required String wsId,
    required String taskId,
    required String listId,
  }) async {
    moves.add('$taskId->$listId');
    return TaskBoardTask(id: taskId, listId: listId);
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
  }) async {
    updates.add((taskId: taskId, priority: priority, endDate: endDate));
    return TaskBoardTask(
      id: taskId,
      listId: 'list-1',
      name: name,
      priority: priority,
      endDate: endDate,
    );
  }

  @override
  Future<void> deleteTask(String taskId, {required String wsId}) async {
    deletes.add(taskId);
  }
}

void main() {
  late _MockWorkspaceCubit workspaceCubit;
  late _RowActionsRepository repository;

  setUp(() {
    workspaceCubit = _MockWorkspaceCubit();
    repository = _RowActionsRepository();
    const workspace = Workspace(id: 'ws-1', name: 'Workspace');
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      ),
    );
  });

  Future<void> pumpBoard(WidgetTester tester) async {
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: TaskBoardDetailPage(
          boardId: 'board-1',
          taskRepository: repository,
        ),
      ),
    );
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(milliseconds: 350));
    }
    await tester.pumpAndSettle();
  }

  TaskBoardDetailCubit readCubit(WidgetTester tester) =>
      BlocProvider.of<TaskBoardDetailCubit>(
        tester.element(find.text('Alpha task').first),
      );

  Finder row(String title) => find.ancestor(
    of: find.text(title).first,
    matching: find.byType(AppSwipeActions),
  );

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
