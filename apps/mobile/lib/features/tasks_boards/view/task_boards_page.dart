import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/tasks_boards/cubit/task_boards_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_boards_view.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

class TaskBoardsPage extends StatelessWidget {
  const TaskBoardsPage({
    super.key,
    this.taskRepository,
    this.permissionsRepository,
  });

  final TaskRepository? taskRepository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<TaskRepository>(
      create: (_) => taskRepository ?? TaskRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = TaskBoardsCubit(
            taskRepository: context.read<TaskRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) {
            unawaited(cubit.loadBoards(wsId));
          }
          return cubit;
        },
        child: TaskBoardsView(permissionsRepository: permissionsRepository),
      ),
    );
  }
}
