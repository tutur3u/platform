import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (context) {
            final cubit = TaskListCubit(taskRepository: TaskRepository());
            _loadTasksIfReady(context, cubit);
            return cubit;
          },
        ),
        BlocProvider(
          create: (context) {
            final cubit = CalendarCubit(
              calendarRepository: CalendarRepository(),
            );
            _loadEventsIfReady(context, cubit);
            return cubit;
          },
        ),
      ],
      child: const _DashboardView(),
    );
  }

  void _loadTasksIfReady(BuildContext context, TaskListCubit cubit) {
    final workspace = context
        .read<WorkspaceCubit>()
        .state
        .personalWorkspaceOrCurrent;
    if (workspace == null) return;
    unawaited(
      cubit.loadTasks(wsId: workspace.id, isPersonal: workspace.personal),
    );
  }

  void _loadEventsIfReady(BuildContext context, CalendarCubit cubit) {
    final workspace = context
        .read<WorkspaceCubit>()
        .state
        .personalWorkspaceOrCurrent;
    if (workspace == null) return;
    unawaited(cubit.loadEvents(workspace.id));
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView();

  @override
  Widget build(BuildContext context) {
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.personalWorkspaceOrCurrent?.id !=
              current.personalWorkspaceOrCurrent?.id,
          listener: (context, state) {
            final workspace = state.personalWorkspaceOrCurrent;
            if (workspace == null) return;
            unawaited(
              context.read<TaskListCubit>().loadTasks(
                wsId: workspace.id,
                isPersonal: workspace.personal,
              ),
            );
            unawaited(context.read<CalendarCubit>().loadEvents(workspace.id));
          },
        ),
      ],
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, workspaceState) {
          final workspace = workspaceState.personalWorkspaceOrCurrent;
          if (workspace == null) {
            return shad.Scaffold(
              child: Center(child: Text(context.l10n.assistantSelectWorkspace)),
            );
          }

          return BlocBuilder<TaskListCubit, TaskListState>(
            builder: (context, taskState) {
              return BlocBuilder<CalendarCubit, CalendarState>(
                builder: (context, calendarState) {
                  final focusTasks = _focusTasks(taskState);
                  final upcomingEvents = _upcomingEvents(calendarState.events);
                  final showInitialLoading =
                      !taskState.hasLoadedOnce &&
                      taskState.status == TaskListStatus.loading &&
                      !calendarState.hasLoadedOnce &&
                      calendarState.status == CalendarStatus.loading;
                  final showRefreshingIndicator =
                      (taskState.status == TaskListStatus.loading &&
                          taskState.hasLoadedOnce) ||
                      (calendarState.status == CalendarStatus.loading &&
                          calendarState.hasLoadedOnce);

                  if (showInitialLoading) {
                    return const shad.Scaffold(
                      child: Center(child: shad.CircularProgressIndicator()),
                    );
                  }

                  return shad.Scaffold(
                    child: RefreshIndicator(
                      onRefresh: () => _refresh(context, workspace),
                      child: Stack(
                        children: [
                          SafeArea(
                            top: false,
                            bottom: false,
                            child: ResponsiveWrapper(
                              maxWidth: ResponsivePadding.maxContentWidth(
                                context.deviceClass,
                              ),
                              child: CustomScrollView(
                                physics: const AlwaysScrollableScrollPhysics(
                                  parent: BouncingScrollPhysics(),
                                ),
                                slivers: [
                                  SliverPadding(
                                    padding: EdgeInsets.fromLTRB(
                                      ResponsivePadding.horizontal(
                                        context.deviceClass,
                                      ),
                                      10,
                                      ResponsivePadding.horizontal(
                                        context.deviceClass,
                                      ),
                                      24 + MediaQuery.paddingOf(context).bottom,
                                    ),
                                    sliver: SliverList.list(
                                      children: [
                                        _TodaySummaryCard(
                                          workspaceName: _displayWorkspaceName(
                                            workspace.name ??
                                                context
                                                    .l10n
                                                    .assistantPersonalWorkspace,
                                          ),
                                          activeTasks:
                                              taskState.totalActiveTasks,
                                          overdueTasks:
                                              taskState.overdueTasks.length,
                                          nextEvents: upcomingEvents.length,
                                        ),
                                        const SizedBox(height: 12),
                                        _OverviewActionsRow(),
                                        const SizedBox(height: 14),
                                        _SectionCard(
                                          title: context
                                              .l10n
                                              .dashboardAssignedToMe,
                                          actionLabel:
                                              context.l10n.dashboardOpenTasks,
                                          onTap: () => context.go(Routes.tasks),
                                          child: _AssignedTasksBlock(
                                            state: taskState,
                                            tasks: focusTasks,
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        _SectionCard(
                                          title: context
                                              .l10n
                                              .dashboardUpcomingEvents,
                                          actionLabel: context
                                              .l10n
                                              .dashboardOpenCalendar,
                                          onTap: () =>
                                              context.go(Routes.calendar),
                                          child: _UpcomingEventsBlock(
                                            status: calendarState.status,
                                            hasLoadedOnce:
                                                calendarState.hasLoadedOnce,
                                            error: calendarState.error,
                                            events: upcomingEvents,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (showRefreshingIndicator)
                            const Positioned(
                              top: 0,
                              left: 16,
                              right: 16,
                              child: IgnorePointer(child: _RefreshStrip()),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _refresh(BuildContext context, Workspace workspace) async {
    await Future.wait([
      context.read<TaskListCubit>().loadTasks(
        wsId: workspace.id,
        isPersonal: workspace.personal,
      ),
      context.read<CalendarCubit>().loadEvents(workspace.id),
    ]);
  }

  List<UserTask> _focusTasks(TaskListState state) {
    final buckets = [state.overdueTasks, state.todayTasks, state.upcomingTasks];
    final seen = <String>{};
    final tasks = <UserTask>[];

    for (final bucket in buckets) {
      for (final task in bucket) {
        if (seen.add(task.id)) tasks.add(task);
        if (tasks.length == 3) return tasks;
      }
    }

    return tasks;
  }

  List<CalendarEvent> _upcomingEvents(List<CalendarEvent> events) {
    final now = DateTime.now();
    final end = now.add(const Duration(days: 7));

    final result =
        events
            .where(
              (event) =>
                  !event.isAllDay &&
                  event.startAt != null &&
                  !event.startAt!.isBefore(now) &&
                  event.startAt!.isBefore(end),
            )
            .toList()
          ..sort((a, b) => a.startAt!.compareTo(b.startAt!));

    return result.take(3).toList(growable: false);
  }

  String _displayWorkspaceName(String value) {
    if (value.toUpperCase() != value) return value;
    return value
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class _TodaySummaryCard extends StatelessWidget {
  const _TodaySummaryCard({
    required this.workspaceName,
    required this.activeTasks,
    required this.overdueTasks,
    required this.nextEvents,
  });

  final String workspaceName;
  final int activeTasks;
  final int overdueTasks;
  final int nextEvents;

  @override
  Widget build(BuildContext context) {
    final dateLabel = DateFormat('EEE, d MMM').format(DateTime.now());
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            theme.colorScheme.surfaceContainerHigh.withValues(alpha: 0.96),
            theme.colorScheme.surfaceContainer.withValues(alpha: 0.82),
          ],
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.dashboardTodayTitle,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$workspaceName • $dateLabel',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  value: '$activeTasks',
                  label: context.l10n.dashboardTasksMetric(activeTasks),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(
                  value: '$overdueTasks',
                  label: context.l10n.dashboardOverdueMetric(overdueTasks),
                  foreground: theme.colorScheme.error,
                  background: theme.colorScheme.errorContainer.withValues(
                    alpha: 0.44,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(
                  value: '$nextEvents',
                  label: context.l10n.dashboardEventsMetric(nextEvents),
                  background: theme.colorScheme.secondaryContainer.withValues(
                    alpha: 0.52,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.value,
    required this.label,
    this.foreground,
    this.background,
  });

  final String value;
  final String label;
  final Color? foreground;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedForeground = foreground ?? theme.colorScheme.onSurface;
    final resolvedBackground =
        background ?? theme.colorScheme.surfaceContainerHighest;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: resolvedBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              color: resolvedForeground,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineActionButton extends StatelessWidget {
  const _InlineActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineButton(
      onPressed: onPressed,
      leading: Icon(icon, size: 16),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _OverviewActionsRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _InlineActionButton(
            icon: Icons.checklist_rounded,
            label: context.l10n.dashboardOpenTasks,
            onPressed: () => context.go(Routes.tasks),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _InlineActionButton(
            icon: Icons.calendar_today_rounded,
            label: context.l10n.dashboardOpenCalendar,
            onPressed: () => context.go(Routes.calendar),
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.actionLabel,
    required this.onTap,
    required this.child,
  });

  final String title;
  final String actionLabel;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow.withValues(alpha: 0.76),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outlineVariant,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              shad.GhostButton(onPressed: onTap, child: Text(actionLabel)),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _AssignedTasksBlock extends StatelessWidget {
  const _AssignedTasksBlock({
    required this.state,
    required this.tasks,
  });

  final TaskListState state;
  final List<UserTask> tasks;

  @override
  Widget build(BuildContext context) {
    if (state.status == TaskListStatus.loading && !state.hasLoadedOnce) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (state.status == TaskListStatus.error &&
        state.totalActiveTasks == 0 &&
        tasks.isEmpty) {
      return _EmptyHint(
        title: context.l10n.dashboardAssignedToMe,
        description: context.l10n.commonSomethingWentWrong,
        icon: Icons.cloud_off_outlined,
        tone: _Tone(
          background: Theme.of(context).colorScheme.errorContainer.withValues(
            alpha: 0.38,
          ),
          border: Theme.of(context).colorScheme.error.withValues(alpha: 0.16),
          foreground: Theme.of(context).colorScheme.error,
        ),
      );
    }

    if (state.totalActiveTasks == 0 || tasks.isEmpty) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return _EmptyHint(
        title: context.l10n.dashboardNoAssignedTasks,
        description: context.l10n.dashboardNoAssignedTasksDescription,
        icon: Icons.task_alt_rounded,
        tone: isDark
            ? const _Tone(
                background: Color(0xFF241F36),
                border: Color(0xFF4A416B),
                foreground: Color(0xFFDACEFF),
              )
            : const _Tone(
                background: Color(0xFFF2EEFF),
                border: Color(0xFFD8CEFF),
                foreground: Color(0xFF4D3C8E),
              ),
      );
    }

    return Column(
      children: [
        for (var index = 0; index < tasks.length; index++) ...[
          _TaskRow(task: tasks[index]),
          if (index != tasks.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _UpcomingEventsBlock extends StatelessWidget {
  const _UpcomingEventsBlock({
    required this.status,
    required this.hasLoadedOnce,
    required this.error,
    required this.events,
  });

  final CalendarStatus status;
  final bool hasLoadedOnce;
  final String? error;
  final List<CalendarEvent> events;

  @override
  Widget build(BuildContext context) {
    if (status == CalendarStatus.loading && !hasLoadedOnce) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (status == CalendarStatus.error && events.isEmpty) {
      return _EmptyHint(
        title: context.l10n.dashboardUpcomingEvents,
        description: error?.trim().isNotEmpty == true
            ? context.l10n.commonSomethingWentWrong
            : context.l10n.commonSomethingWentWrong,
        icon: Icons.cloud_off_outlined,
        tone: _Tone(
          background: Theme.of(context).colorScheme.errorContainer.withValues(
            alpha: 0.38,
          ),
          border: Theme.of(context).colorScheme.error.withValues(alpha: 0.16),
          foreground: Theme.of(context).colorScheme.error,
        ),
      );
    }

    if (events.isEmpty) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return _EmptyHint(
        title: context.l10n.dashboardNoUpcomingEvents,
        description: context.l10n.dashboardNoUpcomingEventsDescription,
        icon: Icons.event_available_rounded,
        tone: isDark
            ? const _Tone(
                background: Color(0xFF1F2936),
                border: Color(0xFF435D7B),
                foreground: Color(0xFFD9EEFF),
              )
            : const _Tone(
                background: Color(0xFFEAF4FF),
                border: Color(0xFFCDE2F8),
                foreground: Color(0xFF285B86),
              ),
      );
    }

    return Column(
      children: [
        for (var index = 0; index < events.length; index++) ...[
          _EventRow(event: events[index]),
          if (index != events.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task});

  final UserTask task;

  @override
  Widget build(BuildContext context) {
    final accent = _priorityColor(task.priority);
    final theme = Theme.of(context);
    final background = Color.alphaBlend(
      accent.withValues(alpha: 0.1),
      theme.colorScheme.surfaceContainerLow,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: background.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accent.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.name ?? 'Untitled task',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  [
                        task.list?.board?.name,
                        task.list?.name,
                        _dueLabel(context, task.endDate),
                      ]
                      .whereType<String>()
                      .where((value) => value.isNotEmpty)
                      .join(' • '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _priorityColor(String? priority) {
    return switch (priority) {
      'critical' => const Color(0xFFB03B3B),
      'high' => const Color(0xFFB46C1F),
      'low' => const Color(0xFF2E6EAA),
      _ => const Color(0xFF5D4A9B),
    };
  }

  String _dueLabel(BuildContext context, DateTime? date) {
    final l10n = context.l10n;
    if (date == null) return l10n.dashboardTaskNoDate;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDay = DateTime(date.year, date.month, date.day);
    final delta = dueDay.difference(today).inDays;

    if (delta < 0) return l10n.dashboardTaskOverdue;
    if (delta == 0) return l10n.dashboardTaskToday;
    if (delta == 1) return l10n.dashboardTaskTomorrow;
    final formattedDate = DateFormat('EEE, d MMM').format(date);
    return '${l10n.dashboardTaskUpcoming} • $formattedDate';
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final start = event.startAt;
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final dateLabel = start == null
        ? context.l10n.dashboardEventAllDay
        : '${DateFormat('EEE, d MMM').format(start)}'
              ' • ${DateFormat('HH:mm').format(start)}';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          accent.withValues(alpha: 0.08),
          theme.colorScheme.surfaceContainerLow,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accent.withValues(alpha: 0.24),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.title ?? 'Untitled event',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  dateLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({
    required this.title,
    required this.description,
    required this.icon,
    required this.tone,
  });

  final String title;
  final String description;
  final IconData icon;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: tone.foreground, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(description, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tone {
  const _Tone({
    required this.background,
    required this.border,
    required this.foreground,
  });

  final Color background;
  final Color border;
  final Color foreground;
}

class _RefreshStrip extends StatelessWidget {
  const _RefreshStrip();

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: const LinearProgressIndicator(minHeight: 3),
    );
  }
}
