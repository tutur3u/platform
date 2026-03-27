import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/widgets/my_tasks_header.dart';
import 'package:mobile/features/tasks/widgets/task_section_accordion.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> _reload(BuildContext context) async {
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (ws == null) return;

  await context.read<TaskListCubit>().loadTasks(
    wsId: ws.id,
    isPersonal: ws.personal,
    forceRefresh: true,
  );
}

class TaskListPage extends StatelessWidget {
  const TaskListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
        final seededState = workspace == null
            ? null
            : TaskListCubit.seedStateFor(
                wsId: workspace.id,
                isPersonal: workspace.personal,
              );
        final cubit = TaskListCubit(
          taskRepository: TaskRepository(),
          initialState: seededState,
        );
        _loadIfReady(context, cubit);
        unawaited(CacheWarmupCoordinator.instance.prewarmModule('tasks'));
        return cubit;
      },
      child: const _TaskListView(),
    );
  }

  void _loadIfReady(BuildContext context, TaskListCubit cubit) {
    final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (ws == null) return;

    unawaited(
      cubit.loadTasks(
        wsId: ws.id,
        isPersonal: ws.personal,
      ),
    );
  }
}

class _TaskListView extends StatefulWidget {
  const _TaskListView();

  @override
  State<_TaskListView> createState() => _TaskListViewState();
}

class _TaskListViewState extends State<_TaskListView> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;

    final state = context.read<TaskListCubit>().state;
    if (state.isCompletedCollapsed ||
        !state.hasMoreCompleted ||
        state.isLoadingMoreCompleted ||
        state.status == TaskListStatus.loading) {
      return;
    }

    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 200) {
      unawaited(context.read<TaskListCubit>().loadMoreCompleted());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final bottomPadding = 32 + MediaQuery.paddingOf(context).bottom;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final ws = state.currentWorkspace;
          if (ws == null) return;

          unawaited(
            context.read<TaskListCubit>().loadTasks(
              wsId: ws.id,
              isPersonal: ws.personal,
            ),
          );
        },
        child: BlocBuilder<TaskListCubit, TaskListState>(
          builder: (context, state) {
            if (state.status == TaskListStatus.loading &&
                state.totalActiveTasks == 0 &&
                state.completedTasks.isEmpty) {
              return const Center(child: shad.CircularProgressIndicator());
            }

            if (state.status == TaskListStatus.error &&
                state.totalActiveTasks == 0 &&
                state.completedTasks.isEmpty) {
              return _ErrorView(error: state.error);
            }

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: RefreshIndicator(
                onRefresh: () => _reload(context),
                child: ListView(
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
                  children: [
                    MyTasksHeader(
                      totalActiveCount: state.totalActiveTasks,
                      overdueCount: state.overdueTasks.length,
                      todayCount: state.todayTasks.length,
                      upcomingCount: state.upcomingTasks.length,
                    ),
                    const SizedBox(height: 12),
                    if (state.overdueTasks.isNotEmpty)
                      TaskSectionAccordion(
                        title: l10n.tasksOverdue,
                        subtitle: l10n.tasksRequiresAttention,
                        icon: Icon(
                          Icons.schedule,
                          size: 18,
                          color: shad.Theme.of(context).colorScheme.destructive,
                        ),
                        accentColor: shad.Theme.of(
                          context,
                        ).colorScheme.destructive,
                        tasks: state.overdueTasks,
                        isCollapsed: state.isOverdueCollapsed,
                        onToggle: () =>
                            context.read<TaskListCubit>().toggleSection(
                              TaskListSection.overdue,
                            ),
                      ),
                    if (state.overdueTasks.isNotEmpty)
                      const SizedBox(height: 10),
                    if (state.todayTasks.isNotEmpty)
                      TaskSectionAccordion(
                        title: l10n.tasksDueToday,
                        subtitle: l10n.tasksCompleteByEndOfDay,
                        icon: const Icon(
                          Icons.today,
                          size: 18,
                          color: Colors.orange,
                        ),
                        accentColor: Colors.orange,
                        tasks: state.todayTasks,
                        isCollapsed: state.isTodayCollapsed,
                        onToggle: () =>
                            context.read<TaskListCubit>().toggleSection(
                              TaskListSection.today,
                            ),
                      ),
                    if (state.todayTasks.isNotEmpty) const SizedBox(height: 10),
                    if (state.upcomingTasks.isNotEmpty)
                      TaskSectionAccordion(
                        title: l10n.tasksUpcoming,
                        subtitle: l10n.tasksPlanAhead,
                        icon: Icon(
                          Icons.outlined_flag,
                          size: 18,
                          color: shad.Theme.of(context).colorScheme.primary,
                        ),
                        accentColor: shad.Theme.of(context).colorScheme.primary,
                        tasks: state.upcomingTasks,
                        isCollapsed: state.isUpcomingCollapsed,
                        onToggle: () =>
                            context.read<TaskListCubit>().toggleSection(
                              TaskListSection.upcoming,
                            ),
                      ),
                    if (state.upcomingTasks.isNotEmpty)
                      const SizedBox(height: 10),
                    if (state.totalActiveTasks == 0) const _AllCaughtUpView(),
                    if (state.totalActiveTasks == 0) const SizedBox(height: 10),
                    if (state.completedTasks.isNotEmpty)
                      TaskSectionAccordion(
                        title: l10n.tasksCompleted,
                        subtitle: l10n.tasksCompletedCount(
                          state.totalCompletedTasks,
                        ),
                        icon: Icon(
                          Icons.check_circle_outline,
                          size: 18,
                          color: Colors.green.shade700,
                        ),
                        accentColor: Colors.green.shade700,
                        tasks: state.completedTasks,
                        trailingCount: state.totalCompletedTasks,
                        isCollapsed: state.isCompletedCollapsed,
                        onToggle: () =>
                            context.read<TaskListCubit>().toggleSection(
                              TaskListSection.completed,
                            ),
                      ),
                    if (state.completedTasks.isNotEmpty &&
                        !state.isCompletedCollapsed &&
                        state.isLoadingMoreCompleted)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: shad.CircularProgressIndicator()),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _AllCaughtUpView extends StatelessWidget {
  const _AllCaughtUpView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.75),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Colors.green.shade700.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(
                Icons.check_rounded,
                size: 28,
                color: Colors.green.shade700,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              l10n.tasksAllCaughtUp,
              style: theme.typography.h4.copyWith(
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              l10n.tasksAllCaughtUpSubtitle,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

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
          const SizedBox(height: 16),
          Text(error ?? l10n.tasksLoadError, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
