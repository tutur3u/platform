import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

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

class _TaskListView extends StatelessWidget {
  const _TaskListView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.tasksTitle)),
      body: BlocListener<WorkspaceCubit, WorkspaceState>(
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
              return const Center(child: CircularProgressIndicator());
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
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(error ?? l10n.tasksEmpty, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------
// "All caught up" empty state
// ------------------------------------------------------------------

class _AllCaughtUpView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 64,
            color: colorScheme.primary,
          ),
          const SizedBox(height: 16),
          Text(
            l10n.tasksAllCaughtUp,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            l10n.tasksAllCaughtUpSubtitle,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
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
    final colorScheme = Theme.of(context).colorScheme;

    return RefreshIndicator(
      onRefresh: () async => _reload(context),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          if (state.overdueTasks.isNotEmpty)
            _TaskSection(
              title: l10n.tasksOverdue,
              titleColor: colorScheme.error,
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
              titleColor: colorScheme.primary,
              tasks: state.upcomingTasks,
            ),
        ],
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: titleColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: titleColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${tasks.length}',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: titleColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
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
// Individual task tile
// ------------------------------------------------------------------

class _TaskTile extends StatelessWidget {
  const _TaskTile(this.task);

  final UserTask task;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    final boardName = task.list?.board?.name;
    final listName = task.list?.name;
    final subtitle = [
      if (boardName != null) boardName,
      if (listName != null) listName,
    ].join(' / ');

    return ListTile(
      leading: _PriorityIndicator(priority: task.priority),
      title: Text(
        task.name ?? '',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (subtitle.isNotEmpty)
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          if (task.priority != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: _PriorityChip(priority: task.priority!, l10n: l10n),
            ),
        ],
      ),
      trailing: task.endDate != null
          ? Text(
              _formatDate(task.endDate!),
              style: textTheme.labelSmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            )
          : null,
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}';
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
      color: _colorForPriority(priority, Theme.of(context).colorScheme),
    );
  }

  static Color _colorForPriority(String? priority, ColorScheme cs) {
    return switch (priority) {
      'critical' => cs.error,
      'high' => Colors.orange,
      'low' => cs.outline,
      _ => cs.primary,
    };
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({required this.priority, required this.l10n});

  final String priority;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final color = _PriorityIndicator._colorForPriority(priority, colorScheme);

    final label = switch (priority) {
      'critical' => l10n.tasksPriorityCritical,
      'high' => l10n.tasksPriorityHigh,
      'low' => l10n.tasksPriorityLow,
      _ => l10n.tasksPriorityNormal,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

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
