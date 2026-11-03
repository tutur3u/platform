import 'package:bloc_test/bloc_test.dart';
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
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';

class RowActionsWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

/// Records the row mutations; reads return a fixed two-list board.
class RowActionsRepository extends TaskRepository {
  final List<String> moves = [];
  final List<String> deletes = [];
  final List<({String taskId, String? priority, DateTime? endDate})> updates =
      [];

  /// When set, the matching mutation fails with this error.
  ApiException? moveError;
  ApiException? updateError;

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
    if (moveError != null) throw moveError!;
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
    bool clearPriority = false,
    bool clearStartDate = false,
    bool clearEndDate = false,
    bool clearEstimationPoints = false,
  }) async {
    if (updateError != null) throw updateError!;
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

/// A workspace cubit fixed on `ws-1`.
RowActionsWorkspaceCubit rowActionsWorkspaceCubit() {
  final cubit = RowActionsWorkspaceCubit();
  const workspace = Workspace(id: 'ws-1', name: 'Workspace');
  whenListen(
    cubit,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: workspace,
      workspaces: [workspace],
    ),
  );
  return cubit;
}

/// Pumps the board page in List view and lets its first loads finish.
/// [timezone] provides the user's timezone setting.
Future<void> pumpRowActionsBoard(
  WidgetTester tester, {
  required RowActionsWorkspaceCubit workspaceCubit,
  required RowActionsRepository repository,
  ITimeTrackerRepository? timeTrackerRepository,
  TimezoneSettingsCubit? timezone,
}) async {
  await tester.pumpApp(
    MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        if (timezone != null)
          BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
      ],
      child: TaskBoardDetailPage(
        boardId: 'board-1',
        taskRepository: repository,
        timeTrackerRepository: timeTrackerRepository,
      ),
    ),
  );
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 350));
  }
  await tester.pumpAndSettle();
}

TaskBoardDetailCubit readRowActionsCubit(WidgetTester tester) =>
    BlocProvider.of<TaskBoardDetailCubit>(
      tester.element(find.text('Alpha task').first),
    );

/// The swipeable row holding [title].
Finder taskRow(String title) => find.ancestor(
  of: find.text(title).first,
  matching: find.byType(AppSwipeActions),
);

/// Lets transient toasts time out so no timer outlives the test.
Future<void> drainToasts(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
}
