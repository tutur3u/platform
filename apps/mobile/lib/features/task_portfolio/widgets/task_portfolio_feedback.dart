import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskPortfolioAccessDenied extends StatelessWidget {
  const TaskPortfolioAccessDenied({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: TaskSurfaceMessageCard(
          icon: Icons.lock_outline,
          title: context.l10n.taskPortfolioAccessDeniedTitle,
          description: context.l10n.taskPortfolioAccessDeniedDescription,
          accentColor: const Color(0xFF64748B),
        ),
      ),
    );
  }
}

class TaskPortfolioErrorView extends StatelessWidget {
  const TaskPortfolioErrorView({super.key, this.error});

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
                unawaited(context.read<TaskPortfolioCubit>().load(wsId));
              }
            },
            child: Text(context.l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}

class TaskPortfolioEmptyState extends StatelessWidget {
  const TaskPortfolioEmptyState({
    required this.icon,
    required this.title,
    required this.description,
    super.key,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return TaskSurfaceMessageCard(
      icon: icon,
      title: title,
      description: description,
      accentColor: const Color(0xFF7C3AED),
    );
  }
}
