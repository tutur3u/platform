import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
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
          unawaited(CacheWarmupCoordinator.instance.prewarmModule('tasks'));
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          return TaskBoardsCubit(
            taskRepository: context.read<TaskRepository>(),
            initialState: wsId == null
                ? null
                : TaskBoardsCubit.seedStateFor(wsId),
          );
        },
        child: TaskBoardsView(permissionsRepository: permissionsRepository),
      ),
    );
  }
}
