import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

String taskBoardDetailLocation({
  required String boardId,
  required String taskId,
}) {
  final boardRoute = Routes.taskBoardDetailPath(boardId);
  final encodedTaskId = Uri.encodeQueryComponent(taskId);
  return '$boardRoute?taskId=$encodedTaskId';
}

String? userTaskBoardDetailLocation(UserTask task) {
  final boardId = task.list?.board?.id.trim();
  if (boardId == null || boardId.isEmpty) {
    return null;
  }
  return taskBoardDetailLocation(boardId: boardId, taskId: task.id);
}

String taskBoardTaskDetailLocation({
  required String boardId,
  required TaskBoardTask task,
}) {
  return taskBoardDetailLocation(boardId: boardId, taskId: task.id);
}

bool openUserTaskBoardDetail(BuildContext context, UserTask task) {
  return openUserTaskBoardDetailWithWorkspace(context, task);
}

bool openUserTaskBoardDetailWithWorkspace(
  BuildContext context,
  UserTask task, {
  WorkspaceCubit? workspaceCubit,
}) {
  final location = userTaskBoardDetailLocation(task);
  if (location == null) {
    return false;
  }

  if (workspaceCubit != null) {
    final workspaceState = workspaceCubit.state;
    final currentWorkspace = workspaceState.currentWorkspace;
    final targetWorkspaceId =
        task.list?.board?.workspace?.id ?? task.list?.board?.wsId;
    if ((currentWorkspace?.personal ?? false) &&
        targetWorkspaceId != null &&
        targetWorkspaceId.isNotEmpty &&
        targetWorkspaceId != currentWorkspace?.id) {
      final targetWorkspace = workspaceState.workspaces
          .where((workspace) => workspace.id == targetWorkspaceId)
          .firstOrNull;
      if (targetWorkspace != null) {
        unawaited(workspaceCubit.selectWorkspace(targetWorkspace));
      }
    }
  }

  context.go(location);
  return true;
}
