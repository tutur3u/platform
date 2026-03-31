import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimatesAccessDenied extends StatelessWidget {
  const TaskEstimatesAccessDenied({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: TaskSurfaceMessageCard(
          icon: Icons.lock_outline,
          title: context.l10n.taskEstimatesAccessDeniedTitle,
          description: context.l10n.taskEstimatesAccessDeniedDescription,
          accentColor: const Color(0xFF64748B),
        ),
      ),
    );
  }
}

class TaskEstimatesErrorView extends StatelessWidget {
  const TaskEstimatesErrorView({super.key, this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: TaskSurfaceMessageCard(
          icon: Icons.error_outline,
          title: context.l10n.commonSomethingWentWrong,
          description: error ?? context.l10n.commonSomethingWentWrong,
          accentColor: shad.Theme.of(context).colorScheme.destructive,
          action: shad.SecondaryButton(
            onPressed: () {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              if (wsId != null) {
                unawaited(context.read<TaskEstimatesCubit>().loadBoards(wsId));
              }
            },
            child: Text(context.l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}

class TaskEstimatesEmptyState extends StatelessWidget {
  const TaskEstimatesEmptyState({
    required this.title,
    required this.description,
    super.key,
  });

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: TaskSurfaceMessageCard(
        icon: Icons.calculate_outlined,
        title: title,
        description: description,
        accentColor: const Color(0xFF0F766E),
      ),
    );
  }
}
