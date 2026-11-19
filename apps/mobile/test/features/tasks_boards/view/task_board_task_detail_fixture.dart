import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';

import 'task_board_quick_actions_fixture.dart';

/// Serves empty relationships and records created tasks.
class TaskDetailRepository extends QuickActionsRepository {
  final List<String> created = [];

  @override
  Future<TaskRelationshipsResponse> getTaskRelationships({
    required String wsId,
    required String taskId,
  }) async => TaskRelationshipsResponse.empty;

  @override
  Future<TaskBoardTask> createBoardTask({
    required String wsId,
    required String listId,
    required String name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
  }) async {
    created.add(name);
    return tasks['new-$name'] = TaskBoardTask(
      id: 'new-$name',
      listId: listId,
      name: name,
    );
  }
}

/// Runs the board's dock create action, as the shell dock would.
Future<void> openTaskCreateForm(WidgetTester tester) async {
  final chrome = tester
      .element(find.byType(TaskBoardDetailPage))
      .read<ShellChromeActionsCubit>();
  final create = chrome.state.registrations.values
      .expand((registration) => registration.actions)
      .firstWhere((action) => action.id == 'task-board-detail-create');
  create.onPressed!();
  await tester.pumpAndSettle();
}
