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
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
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
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) {
            if (state.status != AuthStatus.authenticated ||
                state.user == null) {
              return;
            }
            final workspace = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace;
            if (workspace == null) return;
            unawaited(
              context.read<TaskListCubit>().loadTasks(
                wsId: workspace.id,
                isPersonal: workspace.personal,
                forceRefresh: true,
              ),
            );
            unawaited(
              context.read<CalendarCubit>().loadEvents(
                workspace.id,
                forceRefresh: true,
              ),
            );
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
                                        paletteModuleId: 'finance',
                                        title:
                                            context.l10n.dashboardAssignedToMe,
                                        icon: Icons.checklist_rounded,
                                        actionLabel:
                                            context.l10n.dashboardOpenTasks,
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
                                        paletteModuleId: 'calendar',
                                        title: context
                                            .l10n
                                            .dashboardUpcomingEvents,
                                        icon: Icons.event_rounded,
                                        actionLabel:
                                            context.l10n.dashboardOpenCalendar,
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
        final primaryPalette = AppCardPalette.resolve(
          context,
          index: 0,
          moduleId: 'crm',
        );
        final currentWorkspace = state.currentWorkspace;
        final workspaceName = displayWorkspaceNameOrFallback(
          context,
          currentWorkspace,
        );

        return Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(26),
            onTap: () => showWorkspacePickerSheet(context),
            child: Ink(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: primaryPalette.background,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(
                  color: primaryPalette.border.withValues(alpha: 0.95),
                ),
                boxShadow: [
                  BoxShadow(
                    color: primaryPalette.shadow,
                    blurRadius: 18,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                children: [
                  if (currentWorkspace != null)
                    WorkspaceAvatar(workspace: currentWorkspace, radius: 21)
                  else
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: primaryPalette.iconBackground,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: primaryPalette.border.withValues(alpha: 0.5),
                        ),
                      ),
                      child: Icon(
                        Icons.workspaces_outlined,
                        size: 26,
                        color: primaryPalette.iconColor,
                      ),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.l10n.settingsCurrentWorkspace,
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                color: primaryPalette.textColor.withValues(
                                  alpha: 0.72,
                                ),
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          workspaceName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(
                                color: primaryPalette.textColor,
                                fontWeight: FontWeight.w900,
                              ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: primaryPalette.iconBackground.withValues(
                        alpha: 0.9,
                      ),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: primaryPalette.border.withValues(alpha: 0.45),
                      ),
                    ),
                    child: Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 20,
                      color: primaryPalette.textColor.withValues(alpha: 0.76),
                    ),
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
    required this.activeTasks,
    required this.overdueTasks,
    required this.nextEvents,
  });

  final int activeTasks;
  final int overdueTasks;
  final int nextEvents;

  @override
  Widget build(BuildContext context) {
    final dateLabel = DateFormat('EEE, d MMM').format(DateTime.now());
    final summaryPalette = AppCardPalette.resolve(
      context,
      index: 1,
      moduleId: 'drive',
    );
    final tasksPalette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'finance',
    );
    final overduePalette = AppCardPalette.resolve(
      context,
      index: 1,
      moduleId: 'timer',
    );
    final eventsPalette = AppCardPalette.resolve(
      context,
      index: 2,
      moduleId: 'calendar',
    );
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: summaryPalette.background,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              summaryPalette.iconBackground.withValues(alpha: 0.28),
              summaryPalette.background,
            ),
            Color.alphaBlend(
              overduePalette.iconBackground.withValues(alpha: 0.18),
              summaryPalette.background,
            ),
            Color.alphaBlend(
              eventsPalette.iconBackground.withValues(alpha: 0.14),
              summaryPalette.background,
            ),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: summaryPalette.shadow,
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: summaryPalette.border.withValues(alpha: 0.95),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.dashboardTodayTitle,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: summaryPalette.textColor,
                  fontWeight: FontWeight.w900,
                  height: 1.05,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: summaryPalette.iconBackground.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: summaryPalette.border.withValues(alpha: 0.45),
                  ),
                ),
                child: Text(
                  dateLabel,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: summaryPalette.textColor.withValues(alpha: 0.84),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final compactWidth = (constraints.maxWidth - 10) / 2;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: compactWidth,
                    child: _MetricTile(
                      value: '$activeTasks',
                      label: context.l10n.dashboardActiveTasksLabel,
                      icon: Icons.task_alt_rounded,
                      foreground: tasksPalette.textColor,
                      background: tasksPalette.iconBackground.withValues(
                        alpha: 0.92,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: compactWidth,
                    child: _MetricTile(
                      value: '$overdueTasks',
                      label: context.l10n.dashboardTaskOverdue,
                      icon: Icons.warning_amber_rounded,
                      foreground: overduePalette.textColor,
                      background: overduePalette.iconBackground.withValues(
                        alpha: 0.92,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: _MetricTile(
                      value: '$nextEvents',
                      label: context.l10n.dashboardUpcomingEvents,
                      icon: Icons.calendar_month_rounded,
                      foreground: eventsPalette.textColor,
                      background: eventsPalette.iconBackground.withValues(
                        alpha: 0.92,
                      ),
                      fullWidth: true,
                    ),
                  ),
                ],
              );
            },
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
    required this.paletteModuleId,
    required this.title,
    required this.icon,
    required this.actionLabel,
    required this.onTap,
    required this.child,
  });

  final String paletteModuleId;
  final String title;
  final IconData icon;
  final String actionLabel;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: paletteModuleId,
    );
    final accent = palette.iconColor;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border.withValues(alpha: 0.95)),
        boxShadow: [
          BoxShadow(
            color: palette.shadow,
            blurRadius: 16,
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
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: palette.iconBackground,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: palette.border.withValues(alpha: 0.42),
                  ),
                ),
                child: Icon(
                  icon,
                  size: 22,
                  color: accent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _SectionActionChip(
                label: actionLabel,
                palette: palette,
                onTap: onTap,
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _SectionActionChip extends StatelessWidget {
  const _SectionActionChip({
    required this.label,
    required this.palette,
    required this.onTap,
  });

  final String label;
  final AppCardPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: palette.iconBackground.withValues(alpha: 0.92),
            border: Border.all(color: palette.border.withValues(alpha: 0.6)),
          ),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: palette.textColor,
              fontWeight: FontWeight.w700,
            ),
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
        child: Center(child: NovaLoadingIndicator()),
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
        child: Center(child: NovaLoadingIndicator()),
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
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'finance',
    );
    final accent = palette.iconColor;
    final boardName = task.list?.board?.name;
    final listName = task.list?.name;
    final locationLabel = [boardName, listName]
        .where((value) => value != null && value.isNotEmpty)
        .cast<String>()
        .join(' • ');
    final dueLabel = _dueLabel(context, task.endDate);
    final priorityLabel = switch (task.priority) {
      'critical' => context.l10n.tasksPriorityCritical,
      'high' => context.l10n.tasksPriorityHigh,
      'low' => context.l10n.tasksPriorityLow,
      _ => context.l10n.tasksPriorityNormal,
    };

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => openUserTaskBoardDetailWithWorkspace(
          context,
          task,
          workspaceCubit: context.read<WorkspaceCubit>(),
        ),
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Color.alphaBlend(
              palette.iconBackground.withValues(alpha: 0.62),
              theme.colorScheme.surfaceContainerLow,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: palette.border.withValues(alpha: 0.52),
            ),
            boxShadow: [
              BoxShadow(
                color: palette.shadow.withValues(alpha: 0.8),
                blurRadius: 12,
                offset: const Offset(0, 7),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.name ?? context.l10n.tasksUntitled,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: theme.colorScheme.onSurface,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (locationLabel.isNotEmpty)
                              _DashboardTaskPill(
                                icon: Icons.view_kanban_outlined,
                                label: locationLabel,
                                accent: accent,
                              ),
                            if (task.endDate != null)
                              _DashboardTaskPill(
                                icon: Icons.schedule_outlined,
                                label: dueLabel,
                                accent: accent,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: palette.background,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: palette.border.withValues(alpha: 0.56),
                      ),
                    ),
                    child: Text(
                      priorityLabel,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: accent.withValues(alpha: 0.96),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
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

class _DashboardTaskPill extends StatelessWidget {
  const _DashboardTaskPill({
    required this.icon,
    required this.label,
    this.accent,
  });

  final IconData icon;
  final String label;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'calendar',
    );
    final foreground = accent ?? theme.colorScheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: accent != null
            ? foreground.withValues(alpha: 0.14)
            : palette.iconBackground,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: accent != null
              ? foreground.withValues(alpha: 0.2)
              : palette.border.withValues(alpha: 0.42),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: foreground.withValues(alpha: 0.92)),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: foreground.withValues(alpha: 0.96),
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final start = event.startAt;
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'calendar',
    );
    final accent = palette.iconColor;
    final dateLabel = start == null
        ? context.l10n.dashboardEventAllDay
        : '${DateFormat('EEE, d MMM').format(start)}'
              ' • ${DateFormat('HH:mm').format(start)}';
    final dayLabel = start == null ? '--' : DateFormat('d').format(start);
    final monthLabel = start == null
        ? context.l10n.dashboardEventAllDay
        : DateFormat('MMM').format(start);
    final detail = event.description?.trim();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          palette.iconBackground.withValues(alpha: 0.62),
          theme.colorScheme.surfaceContainerLow,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: palette.border.withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: palette.shadow.withValues(alpha: 0.8),
            blurRadius: 12,
            offset: const Offset(0, 7),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 60,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            decoration: BoxDecoration(
              color: palette.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: palette.border.withValues(alpha: 0.44)),
            ),
            child: Column(
              children: [
                Text(
                  dayLabel,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: accent,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  monthLabel.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: accent.withValues(alpha: 0.92),
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  event.title ?? 'Untitled event',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  dateLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: accent.withValues(alpha: 0.9),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (detail != null && detail.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.35,
                    ),
                  ),
                ],
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
