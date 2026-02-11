import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

// ------------------------------------------------------------------
// Helper to reload tasks from the current context
// ------------------------------------------------------------------

void _reload(BuildContext context) {
  final userId = context.read<AuthCubit>().state.user?.id;
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (userId != null && ws != null) {
    unawaited(
      context.read<TaskListCubit>().loadTasks(
        userId: userId,
        wsId: ws.id,
        isPersonal: ws.personal,
      ),
    );
  }
}

class TaskListPage extends StatelessWidget {
  const TaskListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = TaskListCubit(taskRepository: TaskRepository());
        _loadIfReady(context, cubit);
        return cubit;
      },
      child: const _TaskListView(),
    );
  }

  void _loadIfReady(BuildContext context, TaskListCubit cubit) {
    final userId = context.read<AuthCubit>().state.user?.id;
    final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (userId != null && ws != null) {
      unawaited(
        cubit.loadTasks(
          userId: userId,
          wsId: ws.id,
          isPersonal: ws.personal,
        ),
      );
    }
  }
}

// ------------------------------------------------------------------
// "All caught up" empty state
// ------------------------------------------------------------------

class _AllCaughtUpView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 64,
            color: theme.colorScheme.primary,
          ),
          const shad.Gap(16),
          Text(
            l10n.tasksAllCaughtUp,
            style: theme.typography.h3,
          ),
          const shad.Gap(4),
          Text(
            l10n.tasksAllCaughtUpSubtitle,
            style: theme.typography.textMuted,
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------
// Error state
// ------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

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
          Text(error ?? l10n.tasksEmpty, textAlign: TextAlign.center),
          const shad.Gap(16),
          shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({required this.priority, required this.l10n});

  final String priority;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    final color = _PriorityIndicator._colorForPriority(priority, colorScheme);

    final label = switch (priority) {
      'critical' => l10n.tasksPriorityCritical,
      'high' => l10n.tasksPriorityHigh,
      'low' => l10n.tasksPriorityLow,
      _ => l10n.tasksPriorityNormal,
    };

    return shad.OutlineBadge(
      child: Text(
        label,
        style: shad.Theme.of(context).typography.textSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Priority visual components
// ------------------------------------------------------------------

class _PriorityIndicator extends StatelessWidget {
  const _PriorityIndicator({this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.circle,
      size: 12,
      color: _colorForPriority(priority, shad.Theme.of(context).colorScheme),
    );
  }

  static Color _colorForPriority(String? priority, shad.ColorScheme cs) {
    return switch (priority) {
      'critical' => cs.destructive,
      'high' => Colors.orange,
      'low' => cs.muted,
      _ => cs.primary,
    };
  }
}

class _TaskListView extends StatelessWidget {
  const _TaskListView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                unawaited(context.read<AppTabCubit>().clearSelection());
                context.go(Routes.apps);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.tasksTitle),
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final userId = context.read<AuthCubit>().state.user?.id;
          final ws = state.currentWorkspace;
          if (userId != null && ws != null) {
            unawaited(
              context.read<TaskListCubit>().loadTasks(
                userId: userId,
                wsId: ws.id,
                isPersonal: ws.personal,
              ),
            );
          }
        },
        child: BlocBuilder<TaskListCubit, TaskListState>(
          builder: (context, state) {
            if (state.status == TaskListStatus.loading) {
              return const Center(child: shad.CircularProgressIndicator());
            }

            if (state.status == TaskListStatus.error) {
              return _ErrorView(error: state.error);
            }

            if (state.totalActiveTasks == 0 &&
                state.status == TaskListStatus.loaded) {
              return _AllCaughtUpView();
            }

            return _TaskSections(state: state);
          },
        ),
      ),
    );
  }
}

class _TaskSection extends StatelessWidget {
  const _TaskSection({
    required this.title,
    required this.titleColor,
    required this.tasks,
  });

  final String title;
  final Color titleColor;
  final List<UserTask> tasks;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Text(
                title,
                style: theme.typography.small.copyWith(
                  color: titleColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const shad.Gap(8),
              shad.OutlineBadge(
                child: Text('${tasks.length}'),
              ),
            ],
          ),
        ),
        ...tasks.map(_TaskTile.new),
      ],
    );
  }
}

// ------------------------------------------------------------------
// Sectioned task list
// ------------------------------------------------------------------

class _TaskSections extends StatelessWidget {
  const _TaskSections({required this.state});

  final TaskListState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return RefreshIndicator(
      onRefresh: () async => _reload(context),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          if (state.overdueTasks.isNotEmpty)
            _TaskSection(
              title: l10n.tasksOverdue,
              titleColor: theme.colorScheme.destructive,
              tasks: state.overdueTasks,
            ),
          if (state.todayTasks.isNotEmpty)
            _TaskSection(
              title: l10n.tasksDueToday,
              titleColor: Colors.orange,
              tasks: state.todayTasks,
            ),
          if (state.upcomingTasks.isNotEmpty)
            _TaskSection(
              title: l10n.tasksUpcoming,
              titleColor: theme.colorScheme.primary,
              tasks: state.upcomingTasks,
            ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------
// Individual task tile
// ------------------------------------------------------------------

class _TaskTile extends StatelessWidget {
  const _TaskTile(this.task);

  final UserTask task;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    final boardName = task.list?.board?.name;
    final listName = task.list?.name;
    final subtitle = [
      if (boardName != null) boardName,
      if (listName != null) listName,
    ].join(' / ');

    return shad.GhostButton(
      // TODO(tuturuuu): Implement task details page.
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PriorityIndicator(priority: task.priority),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.name ?? '',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  if (subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textMuted,
                    ),
                  if (task.priority != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: _PriorityChip(
                        priority: task.priority!,
                        l10n: l10n,
                      ),
                    ),
                ],
              ),
            ),
            if (task.endDate != null)
              Text(
                _formatDate(task.endDate!),
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}';
  }
}
