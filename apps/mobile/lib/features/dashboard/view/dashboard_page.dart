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
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class DashboardPage extends StatelessWidget {
  const DashboardPage({
    this.replayToken = 0,
    super.key,
  });

  final int replayToken;

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (context) {
            final workspace = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace;
            final cubit = TaskListCubit(
              taskRepository: TaskRepository(),
              initialState: workspace != null
                  ? TaskListCubit.seedStateFor(
                      wsId: workspace.id,
                      isPersonal: workspace.personal,
                    )
                  : null,
            );
            _loadTasksIfReady(context, cubit);
            return cubit;
          },
        ),
        BlocProvider(
          create: (context) {
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            final cubit = CalendarCubit(
              calendarRepository: CalendarRepository(),
              initialState: wsId != null
                  ? CalendarCubit.seedStateForWorkspace(wsId)
                  : null,
            );
            _loadEventsIfReady(context, cubit);
            return cubit;
          },
        ),
      ],
      child: _DashboardView(replayToken: replayToken),
    );
  }

  void _loadTasksIfReady(BuildContext context, TaskListCubit cubit) {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (workspace == null) return;
    unawaited(
      cubit.loadTasks(wsId: workspace.id, isPersonal: workspace.personal),
    );
  }

  void _loadEventsIfReady(BuildContext context, CalendarCubit cubit) {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (workspace == null) return;
    unawaited(cubit.loadEvents(workspace.id));
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView({required this.replayToken});

  final int replayToken;

  @override
  Widget build(BuildContext context) {
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            final workspace = state.currentWorkspace;
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
          final workspace = workspaceState.currentWorkspace;
          if (workspace == null) {
            final isWorkspaceLoading =
                workspaceState.status == WorkspaceStatus.initial ||
                workspaceState.status == WorkspaceStatus.loading;
            if (isWorkspaceLoading) {
              return const shad.Scaffold(
                child: Center(child: NovaLoadingIndicator()),
              );
            }

            return _workspaceUnavailableState(context, workspaceState);
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

                  if (showInitialLoading) {
                    return const shad.Scaffold(
                      child: Center(child: NovaLoadingIndicator()),
                    );
                  }

                  return shad.Scaffold(
                    child: RefreshIndicator(
                      onRefresh: () => _refresh(context, workspace),
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
                                    StaggeredEntrance(
                                      replayKey: replayToken,
                                      child:
                                          const _DashboardWorkspacePickerCard(),
                                    ),
                                    const SizedBox(height: 12),
                                    StaggeredEntrance(
                                      replayKey: replayToken,
                                      delay: const Duration(milliseconds: 70),
                                      child: _TodaySummaryCard(
                                        workspaceName: displayWorkspaceName(
                                          context,
                                          workspace,
                                        ),
                                        activeTasks: taskState.totalActiveTasks,
                                        overdueTasks:
                                            taskState.overdueTasks.length,
                                        nextEvents: upcomingEvents.length,
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    StaggeredEntrance(
                                      replayKey: replayToken,
                                      delay: const Duration(milliseconds: 140),
                                      child: _SectionCard(
                                        title:
                                            context.l10n.dashboardAssignedToMe,
                                        icon: Icons.checklist_rounded,
                                        accent: const Color(0xFF8B5CF6),
                                        actionLabel:
                                            context.l10n.dashboardOpenTasks,
                                        actionIcon: Icons.arrow_outward_rounded,
                                        onTap: () => context.go(Routes.tasks),
                                        child: _AssignedTasksBlock(
                                          state: taskState,
                                          tasks: focusTasks,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    StaggeredEntrance(
                                      replayKey: replayToken,
                                      delay: const Duration(milliseconds: 210),
                                      child: _SectionCard(
                                        title: context
                                            .l10n
                                            .dashboardUpcomingEvents,
                                        icon: Icons.event_rounded,
                                        accent: const Color(0xFF0EA5E9),
                                        actionLabel:
                                            context.l10n.dashboardOpenCalendar,
                                        actionIcon: Icons.arrow_outward_rounded,
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
                                    ),
                                  ],
                                ),
                              ),
                            ],
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
        forceRefresh: true,
      ),
      context.read<CalendarCubit>().loadEvents(
        workspace.id,
        forceRefresh: true,
      ),
    ]);
  }

  Widget _workspaceUnavailableState(
    BuildContext context,
    WorkspaceState workspaceState,
  ) {
    final isError = workspaceState.status == WorkspaceStatus.error;
    final theme = Theme.of(context);

    return shad.Scaffold(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _EmptyHint(
            title: isError
                ? context.l10n.commonSomethingWentWrong
                : context.l10n.workspaceSelectEmpty,
            description: isError
                ? context.l10n.commonSomethingWentWrong
                : context.l10n.workspaceSelectTitle,
            icon: isError ? Icons.cloud_off_outlined : Icons.workspaces_outline,
            tone: isError
                ? _Tone(
                    background: theme.colorScheme.errorContainer.withValues(
                      alpha: 0.38,
                    ),
                    border: theme.colorScheme.error.withValues(alpha: 0.16),
                    foreground: theme.colorScheme.error,
                  )
                : _Tone(
                    background: theme.colorScheme.surfaceContainer,
                    border: theme.colorScheme.outline.withValues(alpha: 0.22),
                    foreground: theme.colorScheme.onSurface,
                  ),
          ),
        ),
      ),
    );
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
}

class _DashboardWorkspacePickerCard extends StatelessWidget {
  const _DashboardWorkspacePickerCard();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (previous, current) =>
          previous.currentWorkspace != current.currentWorkspace,
      builder: (context, state) {
        final theme = Theme.of(context);
        final isDark = theme.brightness == Brightness.dark;
        final workspaceName = displayWorkspaceNameOrFallback(
          context,
          state.currentWorkspace,
        );

        return Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => showWorkspacePickerSheet(context),
            child: Ink(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: isDark
                      ? const [
                          Color(0xFF1A2437),
                          Color(0xFF2A2145),
                          Color(0xFF16363E),
                        ]
                      : const [
                          Color(0xFFE9F2FF),
                          Color(0xFFF0E9FF),
                          Color(0xFFE8FAF6),
                        ],
                  stops: const [0, 0.62, 1],
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.14)
                      : theme.colorScheme.primary.withValues(alpha: 0.18),
                ),
                boxShadow: [
                  BoxShadow(
                    color: theme.colorScheme.primary.withValues(
                      alpha: isDark ? 0.18 : 0.1,
                    ),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(
                        alpha: isDark ? 0.22 : 0.12,
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.workspaces_outlined,
                      size: 20,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.l10n.settingsCurrentWorkspace,
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          workspaceName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.keyboard_arrow_down_rounded,
                    size: 22,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
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

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? const [
                  Color(0xFF172337),
                  Color(0xFF2A1E45),
                  Color(0xFF14353E),
                ]
              : const [
                  Color(0xFFEAF2FF),
                  Color(0xFFF1E8FF),
                  Color(0xFFE9FBF7),
                ],
          stops: const [0, 0.58, 1],
        ),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.primary.withValues(alpha: 0.16),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.16)
              : theme.colorScheme.primary.withValues(alpha: 0.22),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.dashboardTodayTitle,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface.withValues(
                    alpha: isDark ? 0.18 : 0.6,
                  ),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: theme.colorScheme.outline.withValues(alpha: 0.14),
                  ),
                ),
                child: Text(
                  dateLabel,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  value: '$activeTasks',
                  label: context.l10n.dashboardActiveTasksLabel,
                  icon: Icons.task_alt_rounded,
                  foreground: isDark
                      ? const Color(0xFFF8FAFC)
                      : const Color(0xFF0B2A55),
                  background: isDark
                      ? const Color(0xFF1D2A43)
                      : const Color(0xFFD9EAFF),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MetricTile(
                  value: '$overdueTasks',
                  label: context.l10n.dashboardTaskOverdue,
                  icon: Icons.warning_amber_rounded,
                  foreground: isDark
                      ? const Color(0xFFFFE3E3)
                      : const Color(0xFF5F1111),
                  background: isDark
                      ? const Color(0xFF54202A)
                      : const Color(0xFFFFDDE3),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _MetricTile(
            value: '$nextEvents',
            label: context.l10n.dashboardUpcomingEvents,
            icon: Icons.calendar_month_rounded,
            foreground: isDark
                ? const Color(0xFFD3F4FF)
                : const Color(0xFF0D4258),
            background: isDark
                ? const Color(0xFF173A48)
                : const Color(0xFFD6F2FF),
            fullWidth: true,
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
    required this.icon,
    this.foreground,
    this.background,
    this.fullWidth = false,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color? foreground;
  final Color? background;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedForeground = foreground ?? theme.colorScheme.onSurface;
    final resolvedBackground =
        background ?? theme.colorScheme.surfaceContainerHighest;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: fullWidth ? 14 : 12,
        vertical: fullWidth ? 14 : 12,
      ),
      decoration: BoxDecoration(
        color: resolvedBackground,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: resolvedForeground.withValues(alpha: 0.18),
        ),
      ),
      child: fullWidth
          ? Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: resolvedForeground.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    icon,
                    size: 18,
                    color: resolvedForeground.withValues(alpha: 0.9),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: resolvedForeground.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  value,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: resolvedForeground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  icon,
                  size: 16,
                  color: resolvedForeground.withValues(alpha: 0.9),
                ),
                const SizedBox(height: 6),
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
                    color: resolvedForeground.withValues(alpha: 0.84),
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                  ),
                ),
              ],
            ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.icon,
    required this.accent,
    required this.actionLabel,
    required this.actionIcon,
    required this.onTap,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Color accent;
  final String actionLabel;
  final IconData actionIcon;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final surfaceBase = theme.colorScheme.surfaceContainerLow;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              accent.withValues(alpha: isDark ? 0.2 : 0.12),
              surfaceBase,
            ),
            Color.alphaBlend(
              accent.withValues(alpha: isDark ? 0.1 : 0.06),
              theme.colorScheme.surfaceContainerLowest,
            ),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: accent.withValues(alpha: isDark ? 0.36 : 0.26),
        ),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: isDark ? 0.24 : 0.12),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withValues(alpha: isDark ? 0.34 : 0.18),
                  border: Border.all(
                    color: accent.withValues(alpha: isDark ? 0.62 : 0.38),
                  ),
                ),
                child: Icon(
                  icon,
                  size: 16,
                  color: accent.withValues(alpha: isDark ? 0.96 : 0.84),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _SectionActionChip(
                label: actionLabel,
                icon: actionIcon,
                accent: accent,
                onTap: onTap,
              ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _SectionActionChip extends StatelessWidget {
  const _SectionActionChip({
    required this.label,
    required this.icon,
    required this.accent,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: accent.withValues(alpha: isDark ? 0.28 : 0.16),
            border: Border.all(
              color: accent.withValues(alpha: isDark ? 0.56 : 0.34),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 6),
              Icon(icon, size: 14),
            ],
          ),
        ),
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
    final accent = _resolveEventAccent(event);
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

  Color _resolveEventAccent(CalendarEvent event) {
    final parsed = _parseHexColor(event.color);
    if (parsed != null) {
      return parsed;
    }

    const palette = [
      Color(0xFF06B6D4),
      Color(0xFF8B5CF6),
      Color(0xFF3B82F6),
      Color(0xFFEC4899),
      Color(0xFF10B981),
      Color(0xFFF59E0B),
    ];

    final seed = event.id.hashCode.abs();
    return palette[seed % palette.length];
  }

  Color? _parseHexColor(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }

    final normalized = value.trim().replaceFirst('#', '');
    if (normalized.length != 6 && normalized.length != 8) {
      return null;
    }

    final rgba = normalized.length == 6 ? 'FF$normalized' : normalized;
    final parsed = int.tryParse(rgba, radix: 16);
    if (parsed == null) {
      return null;
    }

    return Color(parsed);
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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            tone.background,
            Color.alphaBlend(
              tone.foreground.withValues(alpha: isDark ? 0.08 : 0.04),
              tone.background,
            ),
          ],
        ),
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
