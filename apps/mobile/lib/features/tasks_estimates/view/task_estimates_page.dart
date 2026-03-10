import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/tasks_estimates/view/task_estimates_view.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

class TaskEstimatesPage extends StatelessWidget {
  const TaskEstimatesPage({
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final TaskRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<TaskRepository>(
      create: (_) => repository ?? TaskRepository(),
      child: MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (context) {
              final cubit = TaskEstimatesCubit(
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
          ),
          BlocProvider(
            create: (context) {
              final cubit = TaskLabelsCubit(
                taskRepository: context.read<TaskRepository>(),
              );
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              if (wsId != null) {
                unawaited(cubit.loadLabels(wsId));
              }
              return cubit;
            },
          ),
        ],
        child: TaskEstimatesView(
          permissionsRepository: permissionsRepository,
        ),
      ),
    );
  }
}
