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

                  return shad.Scaffold(
                    child: RefreshIndicator(
                      onRefresh: () => _refresh(context, workspace),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Theme.of(context).colorScheme.surface,
                              Theme.of(context)
                                  .colorScheme
                                  .surfaceContainerLowest
                                  .withValues(alpha: 0.88),
                              Theme.of(context).colorScheme.surface,
                            ],
                          ),
                        ),
                        child: SafeArea(
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
                                        activeTasks: taskState.totalActiveTasks,
                                        overdueTasks:
                                            taskState.overdueTasks.length,
                                        nextEvents: upcomingEvents.length,
                                      ),
                                      const SizedBox(height: 12),
                                      _OverviewActionsRow(),
                                      const SizedBox(height: 14),
                                      _SectionCard(
                                        title:
                                            context.l10n.dashboardAssignedToMe,
                                        actionLabel:
                                            context.l10n.dashboardOpenTasks,
                                        onTap: () => context.go(Routes.tasks),
                                        child: _AssignedTasksBlock(
                                          state: taskState,
                                          tasks: focusTasks,
                                        ),
                                      ),
                                      const SizedBox(height: 14),
                                      _SectionCard(
                                        title: context
                                            .l10n
                                            .dashboardUpcomingEvents,
                                        actionLabel:
                                            context.l10n.dashboardOpenCalendar,
                                        onTap: () =>
                                            context.go(Routes.calendar),
                                        child: _UpcomingEventsBlock(
                                          status: calendarState.status,
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
    final isDark = theme.brightness == Brightness.dark;
    final headerTone = isDark
        ? const _DashboardSurfaceTone(
            background: Color(0xFF241D36),
            backgroundSecondary: Color(0xFF1E2937),
            border: Color(0xFF4E4A73),
            shadow: Color(0x33121824),
            title: Color(0xFFF3EEFF),
            subtitle: Color(0xFFC6BEDD),
          )
        : const _DashboardSurfaceTone(
            background: Color(0xFFF1EAFF),
            backgroundSecondary: Color(0xFFE8F4FF),
            border: Color(0xFFD5C8F0),
            shadow: Color(0x1F9C8BD7),
            title: Color(0xFF271C43),
            subtitle: Color(0xFF61567C),
          );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [headerTone.background, headerTone.backgroundSecondary],
        ),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: headerTone.border),
        boxShadow: [
          BoxShadow(
            color: headerTone.shadow,
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.dashboardTodayTitle,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              color: headerTone.title,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$workspaceName • $dateLabel',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: headerTone.subtitle,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricPill(
                icon: Icons.checklist_rounded,
                label: context.l10n.dashboardTasksMetric(activeTasks),
                tone: isDark
                    ? const _Tone(
                        background: Color(0xFF1E3428),
                        border: Color(0xFF3F7152),
                        foreground: Color(0xFFD9F4E3),
                      )
                    : const _Tone(
                        background: Color(0xFFE9F7EF),
                        border: Color(0xFFBDE2CA),
                        foreground: Color(0xFF1B5C39),
                      ),
              ),
              _MetricPill(
                icon: Icons.warning_amber_rounded,
                label: context.l10n.dashboardOverdueMetric(overdueTasks),
                tone: isDark
                    ? const _Tone(
                        background: Color(0xFF3A2C1F),
                        border: Color(0xFF8A6338),
                        foreground: Color(0xFFFFE8C9),
                      )
                    : const _Tone(
                        background: Color(0xFFFFF1DF),
                        border: Color(0xFFEBCB9E),
                        foreground: Color(0xFF8A531D),
                      ),
              ),
              _MetricPill(
                icon: Icons.calendar_today_rounded,
                label: context.l10n.dashboardEventsMetric(nextEvents),
                tone: isDark
                    ? const _Tone(
                        background: Color(0xFF1E3040),
                        border: Color(0xFF466989),
                        foreground: Color(0xFFD9EDFF),
                      )
                    : const _Tone(
                        background: Color(0xFFEAF3FF),
                        border: Color(0xFFC6DCF8),
                        foreground: Color(0xFF25537E),
                      ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({
    required this.icon,
    required this.label,
    required this.tone,
  });

  final IconData icon;
  final String label;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: tone.foreground),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: tone.foreground,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewActionsRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ActionChip(
          avatar: const Icon(Icons.checklist_rounded, size: 16),
          label: Text(context.l10n.dashboardOpenTasks),
          onPressed: () => context.go(Routes.tasks),
        ),
        ActionChip(
          avatar: const Icon(Icons.calendar_today_rounded, size: 16),
          label: Text(context.l10n.dashboardOpenCalendar),
          onPressed: () => context.go(Routes.calendar),
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
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(26),
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
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              TextButton(onPressed: onTap, child: Text(actionLabel)),
            ],
          ),
          const SizedBox(height: 10),
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
    if (state.status == TaskListStatus.loading &&
        state.totalActiveTasks == 0 &&
        tasks.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (state.status == TaskListStatus.error &&
        state.totalActiveTasks == 0 &&
        tasks.isEmpty) {
      return Text(state.error ?? '');
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
    required this.error,
    required this.events,
  });

  final CalendarStatus status;
  final String? error;
  final List<CalendarEvent> events;

  @override
  Widget build(BuildContext context) {
    if (status == CalendarStatus.loading && events.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (status == CalendarStatus.error && events.isEmpty) {
      return Text(error ?? '');
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
    final iconBackground = Color.alphaBlend(
      accent.withValues(alpha: 0.16),
      theme.colorScheme.surfaceContainerHigh,
    );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: accent.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: iconBackground,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.task_alt_rounded, size: 18, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.name ?? 'Untitled task',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          accent.withValues(alpha: 0.08),
          theme.colorScheme.surfaceContainerLow,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: accent.withValues(alpha: 0.24),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Color.alphaBlend(
                accent.withValues(alpha: 0.16),
                theme.colorScheme.surfaceContainerHigh,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              Icons.event_rounded,
              size: 18,
              color: accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.title ?? 'Untitled event',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: tone.foreground.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: tone.foreground),
          ),
          const SizedBox(width: 12),
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

class _DashboardSurfaceTone {
  const _DashboardSurfaceTone({
    required this.background,
    required this.backgroundSecondary,
    required this.border,
    required this.shadow,
    required this.title,
    required this.subtitle,
  });

  final Color background;
  final Color backgroundSecondary;
  final Color border;
  final Color shadow;
  final Color title;
  final Color subtitle;
}
