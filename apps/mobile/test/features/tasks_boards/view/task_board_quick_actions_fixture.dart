import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

import 'task_board_row_actions_fixture.dart';

typedef QuickActionUpdate = ({
  String taskId,
  String? priority,
  bool clearPriority,
  DateTime? startDate,
  bool clearStartDate,
  DateTime? endDate,
  bool clearEndDate,
  List<String>? labelIds,
  List<String>? assigneeIds,
});

/// Keeps task state between reads so refreshes return what was saved, and
/// records every field the quick sheet sends. [updateError] fails updates
/// before anything is saved.
class QuickActionsRepository extends RowActionsRepository {
  final Map<String, TaskBoardTask> tasks = {
    'task-1': TaskBoardTask(
      id: 'task-1',
      listId: 'list-1',
      name: 'Alpha task',
      priority: 'high',
      startDate: DateTime(2026, 10, 20),
      endDate: DateTime(2026, 10, 24, 23, 59, 59),
      labelIds: const ['label-1'],
    ),
    'task-2': const TaskBoardTask(
      id: 'task-2',
      listId: 'list-1',
      name: 'Beta task',
    ),
  };
  final List<QuickActionUpdate> sent = [];

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    final detail = await super.getTaskBoardDetail(wsId, boardId);
    return detail.copyWith(
      tasks: tasks.values.toList(growable: false),
      members: const [WorkspaceUserOption(id: 'user-1', displayName: 'Lan')],
      labels: const [
        TaskLabel(
          id: 'label-1',
          wsId: 'ws-1',
          name: 'Finance',
          color: '#22C55E',
        ),
        TaskLabel(id: 'label-2', wsId: 'ws-1', name: 'Work', color: '#3B82F6'),
      ],
    );
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
  }) async => offset > 0
      ? const <TaskBoardTask>[]
      : tasks.values.where((task) => task.listId == listId).toList();

  @override
  Future<TaskBoardTask> moveBoardTask({
    required String wsId,
    required String taskId,
    required String listId,
  }) async {
    await super.moveBoardTask(wsId: wsId, taskId: taskId, listId: listId);
    return tasks[taskId] = tasks[taskId]!.copyWith(listId: listId);
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
    sent.add((
      taskId: taskId,
      priority: priority,
      clearPriority: clearPriority,
      startDate: startDate,
      clearStartDate: clearStartDate,
      endDate: endDate,
      clearEndDate: clearEndDate,
      labelIds: labelIds,
      assigneeIds: assigneeIds,
    ));
    final current = tasks[taskId]!;
    return tasks[taskId] = TaskBoardTask(
      id: taskId,
      listId: current.listId,
      name: name ?? current.name,
      priority: clearPriority ? null : priority ?? current.priority,
      startDate: clearStartDate ? null : startDate ?? current.startDate,
      endDate: clearEndDate ? null : endDate ?? current.endDate,
      labelIds: labelIds ?? current.labelIds,
      assigneeIds: assigneeIds ?? current.assigneeIds,
    );
  }
}

Finder quickActionTile(String key) => find.byKey(ValueKey(key));

/// Pumps the board, lets its first loads finish and taps [taskName].
Future<void> openQuickActionsSheet(
  WidgetTester tester, {
  required RowActionsWorkspaceCubit workspaceCubit,
  required QuickActionsRepository repository,
  String taskName = 'Alpha task',
  TimezoneSettingsCubit? timezone,
}) async {
  await pumpRowActionsBoard(
    tester,
    workspaceCubit: workspaceCubit,
    repository: repository,
    timezone: timezone,
  );
  await tester.tap(find.text(taskName).first);
  await tester.pumpAndSettle();
}

/// Settles the edit's UI. Chained saves explicitly wait for the original
/// mutation's cache work; single edits and deliberately dropped edits do not.
Future<void> settleQuickActionMutation(
  WidgetTester tester, {
  bool waitForCompletion = false,
}) async {
  await tester.pump();
  final cubit = readRowActionsCubit(tester);
  if (!cubit.state.isMutating) return;
  await tester.pumpAndSettle();
  if (!waitForCompletion) return;
  final deadline = tester.binding.clock.now().add(const Duration(seconds: 30));
  while (cubit.state.isMutating) {
    if (!tester.binding.clock.now().isBefore(deadline)) {
      fail('quick-action save did not complete within 30s');
    }
    await tester.runAsync(() => Future<void>(() {}));
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.pumpAndSettle();
}
