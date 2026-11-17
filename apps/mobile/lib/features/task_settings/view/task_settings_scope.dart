import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Provides the task repository and the cubits a Task settings screen reads.
///
/// Each flag creates and loads one cubit for the current workspace, so a
/// screen only fetches the data it shows.
class TaskSettingsScope extends StatelessWidget {
  const TaskSettingsScope({
    required this.child,
    this.repository,
    this.estimates = false,
    this.labels = false,
    this.portfolio = false,
    super.key,
  });

  final Widget child;
  final TaskRepository? repository;
  final bool estimates;
  final bool labels;
  final bool portfolio;

  @override
  Widget build(BuildContext context) {
    unawaited(CacheWarmupCoordinator.instance.prewarmModule('tasks'));
    return RepositoryProvider<TaskRepository>(
      create: (_) => repository ?? TaskRepository(),
      child: MultiBlocProvider(
        providers: [
          if (estimates)
            BlocProvider(
              create: (context) {
                final wsId = _workspaceId(context);
                final cubit = TaskEstimatesCubit(
                  taskRepository: context.read<TaskRepository>(),
                  initialState: wsId == null
                      ? null
                      : TaskEstimatesCubit.seedStateFor(wsId),
                );
                if (wsId != null) unawaited(cubit.loadBoards(wsId));
                return cubit;
              },
            ),
          if (labels)
            BlocProvider(
              create: (context) {
                final wsId = _workspaceId(context);
                final cubit = TaskLabelsCubit(
                  taskRepository: context.read<TaskRepository>(),
                  initialState: wsId == null
                      ? null
                      : TaskLabelsCubit.seedStateFor(wsId),
                );
                if (wsId != null) unawaited(cubit.loadLabels(wsId));
                return cubit;
              },
            ),
          if (portfolio)
            BlocProvider(
              create: (context) {
                final wsId = _workspaceId(context);
                final cubit = TaskPortfolioCubit(
                  taskRepository: context.read<TaskRepository>(),
                  initialState: wsId == null
                      ? null
                      : TaskPortfolioCubit.seedStateFor(wsId),
                );
                if (wsId != null) unawaited(cubit.load(wsId));
                return cubit;
              },
            ),
        ],
        child: child,
      ),
    );
  }

  static String? _workspaceId(BuildContext context) =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;
}

/// Reloads whichever Task settings cubits are in scope for [wsId].
Future<void> reloadTaskSettingsData(
  BuildContext context,
  String wsId, {
  bool forceRefresh = false,
}) async {
  final estimates = context.read<TaskEstimatesCubit?>();
  final labels = context.read<TaskLabelsCubit?>();
  final portfolio = context.read<TaskPortfolioCubit?>();
  await Future.wait([
    if (estimates != null) estimates.loadBoards(wsId),
    if (labels != null) labels.loadLabels(wsId, forceRefresh: forceRefresh),
    if (portfolio != null) portfolio.load(wsId, forceRefresh: forceRefresh),
  ]);
}
