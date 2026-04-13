import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_bulk.dart';
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

class _BulkSelectionRepository extends TaskRepository {
  _BulkSelectionRepository();

  int bulkCalls = 0;
  List<String> lastBulkTaskIds = const <String>[];
  TaskBulkOperation? lastOperation;

  final TaskBoardDetail _detail = const TaskBoardDetail(
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
  ) async {
    return _detail;
  }

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
    if (offset > 0) {
      return const <TaskBoardTask>[];
    }

    return _detail.tasks
        .where((task) => task.listId == listId)
        .toList(growable: false);
  }

  @override
  Future<TaskBulkResult> bulkBoardTasks({
    required String wsId,
    required List<String> taskIds,
    required TaskBulkOperation operation,
  }) async {
    bulkCalls += 1;
    lastBulkTaskIds = taskIds;
    lastOperation = operation;
    return TaskBulkResult(
      successCount: taskIds.length,
      failCount: 0,
      taskIds: taskIds,
      succeededTaskIds: taskIds,
      failures: const <TaskBulkFailure>[],
      taskMetaById: const <String, TaskBulkTaskMeta>{},
    );
  }

  @override
  Future<TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
  }) async {
    return const TaskBoardsPage(
      boards: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
    );
  }
}

void main() {
  group('Task board bulk selection UI', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _BulkSelectionRepository repository;

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      repository = _BulkSelectionRepository();

      const workspace = Workspace(id: 'ws-1', name: 'Workspace');
      const workspaceState = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );

      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: workspaceState,
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

      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
    }

    TaskBoardDetailCubit readCubit(WidgetTester tester) {
      final context = tester.element(find.text('Alpha task').first);
      return BlocProvider.of<TaskBoardDetailCubit>(context);
    }

    testWidgets(
      'long press enters bulk mode and toggles selection in list view',
      (
        tester,
      ) async {
        await pumpBoard(tester);

        await tester.longPress(find.text('Alpha task').first);
        await tester.pumpAndSettle();

        final cubit = readCubit(tester);
        expect(cubit.state.isBulkSelectMode, isTrue);
        expect(cubit.state.selectedTaskIds, {'task-1'});

        await tester.tap(find.text('Beta task').first);
        await tester.pumpAndSettle();

        expect(cubit.state.selectedTaskIds, {'task-1', 'task-2'});

        await tester.tap(find.text('Beta task').first);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Alpha task').first);
        await tester.pumpAndSettle();

        expect(cubit.state.isBulkSelectMode, isFalse);
        expect(cubit.state.selectedTaskIds, isEmpty);
      },
    );

    testWidgets('tap in bulk mode toggles selection and does not open editor', (
      tester,
    ) async {
      await pumpBoard(tester);

      await tester.longPress(find.text('Alpha task').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Beta task').first);
      await tester.pumpAndSettle();

      expect(find.text('Edit task'), findsNothing);

      final cubit = readCubit(tester);
      expect(cubit.state.selectedTaskIds, {'task-1', 'task-2'});

      await tester.tap(find.text('Beta task').first);
      await tester.pumpAndSettle();

      expect(cubit.state.selectedTaskIds, {'task-1'});
      expect(find.text('Edit task'), findsNothing);
    });
  });
}
