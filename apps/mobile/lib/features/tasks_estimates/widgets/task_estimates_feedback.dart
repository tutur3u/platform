import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.lock_outline,
              size: 48,
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
            const shad.Gap(16),
            Text(
              context.l10n.taskEstimatesAccessDeniedTitle,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.large,
            ),
            const shad.Gap(8),
            Text(
              context.l10n.taskEstimatesAccessDeniedDescription,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.textMuted,
            ),
          ],
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: shad.Theme.of(context).colorScheme.destructive,
          ),
          const shad.Gap(16),
          Text(
            error ?? context.l10n.commonSomethingWentWrong,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(16),
          shad.SecondaryButton(
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
        ],
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
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 8),
      child: Column(
        children: [
          Icon(
            Icons.calculate_outlined,
            size: 48,
            color: theme.colorScheme.mutedForeground,
          ),
          const shad.Gap(12),
          Text(title, style: theme.typography.large),
          const shad.Gap(6),
          Text(
            description,
            textAlign: TextAlign.center,
            style: theme.typography.textMuted,
          ),
        ],
      ),
    );
  }
}
