import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
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
              context.l10n.taskPortfolioAccessDeniedTitle,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.large,
            ),
            const shad.Gap(8),
            Text(
              context.l10n.taskPortfolioAccessDeniedDescription,
              textAlign: TextAlign.center,
              style: shad.Theme.of(context).typography.textMuted,
            ),
          ],
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
                unawaited(context.read<TaskPortfolioCubit>().load(wsId));
              }
            },
            child: Text(context.l10n.commonRetry),
          ),
        ],
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
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Column(
        children: [
          Icon(
            icon,
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
