import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/my_task_sections.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/tasks/widgets/my_task_filters.dart';
import 'package:mobile/features/tasks/widgets/my_task_quick_add_sheet.dart';
import 'package:mobile/features/tasks/widgets/my_task_row.dart';
import 'package:mobile/features/tasks/widgets/my_task_section_header.dart';
import 'package:mobile/features/tasks_boards/data/task_broadcast_client.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class TaskListPage extends StatelessWidget {
  const TaskListPage({
    super.key,
    this.taskRepository,
    this.taskBroadcastClient,
    this.clock = DateTime.now,
  });

  final TaskRepository? taskRepository;
  final TaskBroadcastClient? taskBroadcastClient;
  final DateTime Function() clock;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    final auth = context.read<AuthCubit>();
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.status == AuthStatus.authenticated
          ? cubit.state.user?.id
          : null,
    );
    if (workspace == null || actor == null) return const SizedBox.shrink();

    return RepositoryProvider(
      key: ValueKey((workspace.id, workspace.personal, actor)),
      create: (_) => taskRepository ?? TaskRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = TaskListCubit(
            taskRepository: context.read<TaskRepository>(),
            taskBroadcastClient: taskBroadcastClient,
            clock: clock,
            initialState: TaskListCubit.seedStateFor(
              wsId: workspace.id,
              isPersonal: workspace.personal,
              userId: actor,
            ),
          );
          unawaited(
            cubit.loadTasks(
              wsId: workspace.id,
              isPersonal: workspace.personal,
              userId: actor,
            ),
          );
          unawaited(CacheWarmupCoordinator.instance.prewarmModule('tasks'));
          return cubit;
        },
        child: _MyTasksView(
          workspace: workspace,
          actor: actor,
          clock: clock,
          onOpenTask: (task) => openUserTaskBoardDetailWithWorkspace(
            context,
            task,
            workspaceCubit: context.read<WorkspaceCubit>(),
            canNavigate: () =>
                auth.state.status == AuthStatus.authenticated &&
                auth.state.user?.id == actor,
          ),
        ),
      ),
    );
  }
}

class _MyTasksView extends StatefulWidget {
  const _MyTasksView({
    required this.workspace,
    required this.actor,
    required this.clock,
    required this.onOpenTask,
  });

  final Workspace workspace;
  final String actor;
  final DateTime Function() clock;
  final Future<bool> Function(UserTask) onOpenTask;

  @override
  State<_MyTasksView> createState() => _MyTasksViewState();
}

class _MyTasksViewState extends State<_MyTasksView> {
  final _filters = <MyTaskFilter, AppSheetChoice<String>>{};
  Timer? _midnight;
  String? _zone;
  late DateTime _now;
  late final AppLifecycleListener _lifecycle;
  AppToastHandle? _toast;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: _onClockChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final preferences = context.watch<TimezoneSettingsCubit?>()?.state;
    _zone = preferences?.resolved == true ? preferences!.effective : null;
    _scheduleMidnight();
  }

  @override
  void dispose() {
    _midnight?.cancel();
    _toast?.close();
    _lifecycle.dispose();
    super.dispose();
  }

  void _scheduleMidnight() {
    _midnight?.cancel();
    _now = widget.clock();
    _midnight = Timer(taskTimeUntilNextDay(_now, _zone), _onClockChanged);
  }

  void _onClockChanged() {
    if (mounted) setState(_scheduleMidnight);
  }

  bool _isCurrentScope() {
    if (!mounted) return false;
    final auth = context.read<AuthCubit>().state;
    return auth.status == AuthStatus.authenticated &&
        auth.user?.id == widget.actor &&
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ==
            widget.workspace.id;
  }

  Future<void> _refresh({bool retainError = true}) =>
      context.read<TaskListCubit>().loadTasks(
        wsId: widget.workspace.id,
        isPersonal: widget.workspace.personal,
        userId: widget.actor,
        forceRefresh: true,
        retainError: retainError,
      );

  Future<void> _quickAdd() async {
    final repository = context.read<TaskRepository>();
    final cubit = context.read<TaskListCubit>();
    final added = await showAppSheet<bool>(
      context: context,
      size: AppSheetSize.large,
      useRootNavigator: true,
      builder: (_) => MyTaskQuickAddSheet(
        repository: repository,
        cubit: cubit,
        workspaceId: widget.workspace.id,
        isCurrentScope: _isCurrentScope,
        now: widget.clock(),
        zone: _zone,
      ),
    );
    if (added == true && mounted && _isCurrentScope()) {
      unawaited(AppHaptics.success());
      _toast = showAppToast(
        context,
        message: context.l10n.taskBoardDetailTaskCreated,
      );
    }
  }

  void _showError() {
    if (_isCurrentScope()) {
      _toast = showAppToast(
        context,
        message: context.l10n.commonSomethingWentWrong,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  Future<void> _complete(UserTask task) async {
    if (!_isCurrentScope()) return;
    try {
      final undo = await context.read<TaskListCubit>().completeMyTask(
        task,
        zone: _zone,
      );
      if (undo == null || !mounted || !_isCurrentScope()) return;
      unawaited(AppHaptics.success());
      _toast = showAppToast(
        context,
        message: context.l10n.tasksMarkedComplete,
        actionLabel: context.l10n.tasksUndo,
        onAction: () => unawaited(_undoCompletion(undo)),
      );
    } on Exception {
      _showError();
    }
  }

  Future<void> _undoCompletion(MyTaskUndo undo) async {
    if (!_isCurrentScope()) return;
    try {
      await undo();
    } on Exception {
      _showError();
    }
  }

  Future<void> _snooze(UserTask task) async {
    if (!_isCurrentScope()) return;
    final now = widget.clock();
    final today = taskDay(now, _zone);
    final due = task.endDate;
    final dueDay = due == null ? today : taskDay(due, _zone);
    final anchor = dueDay.isAfter(today) ? dueDay : today;
    final nextDay = DateTime(anchor.year, anchor.month, anchor.day + 1);
    try {
      await context.read<TaskListCubit>().snoozeMyTask(
        task,
        date: taskEndOfDayIn(nextDay, _zone),
        zone: _zone,
      );
      if (mounted && _isCurrentScope()) {
        unawaited(AppHaptics.success());
        _toast = showAppToast(
          context,
          message: context.l10n.taskBoardDetailDueDateUpdated,
        );
      }
    } on Exception {
      _showError();
    }
  }

  bool _matches(UserTask task) {
    final board = _filters[MyTaskFilter.board]?.value;
    final priority = _filters[MyTaskFilter.priority]?.value;
    final label = _filters[MyTaskFilter.label]?.value;
    return (board == null || task.list?.board?.id == board) &&
        (priority == null || task.priority == priority) &&
        (label == null || task.labels.any((item) => item.id == label));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Stack(
      children: [
        ShellTitleOverride(
          ownerId: 'my-tasks-title',
          locations: const {Routes.taskAssigned},
          title: l10n.tasksMyTasks,
        ),
        ShellChromeActions(
          ownerId: 'my-tasks-actions',
          locations: const {Routes.taskAssigned},
          actions: [
            ShellActionSpec(
              id: 'my-task-create',
              icon: LucideIcons.plus,
              tooltip: l10n.taskBoardDetailCreateTask,
              onPressed: _quickAdd,
              inDock: true,
              filled: true,
            ),
          ],
        ),
        BlocBuilder<TaskListCubit, TaskListState>(
          builder: (context, state) {
            if (!state.hasLoadedOnce) {
              if (state.status == TaskListStatus.error) {
                return NovaRefreshIndicator.state(
                  onRefresh: _refresh,
                  child: AppPageBody(
                    child: AppStateMessage(
                      icon: LucideIcons.circleAlert,
                      title: l10n.tasksLoadError,
                      actionLabel: l10n.commonRetry,
                      onAction: () => _refresh(retainError: false),
                    ),
                  ),
                );
              }
              return const AppPageListView(
                children: [AppSkeletonRows(count: 6)],
              );
            }

            final all = projectMyTasks(state, now: _now, zone: _zone);
            final allTasks = all.values
                .expand((items) => items)
                .toList(growable: false);
            final filtered = all.map(
              (section, items) => MapEntry(
                section,
                items.where(_matches).toList(growable: false),
              ),
            );
            final hasActive = TaskListSection.values
                .where((section) => section != TaskListSection.completed)
                .any((section) => filtered[section]!.isNotEmpty);
            return NovaRefreshIndicator(
              onRefresh: _refresh,
              child: AppPageScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  if (allTasks.isNotEmpty || _filters.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: MyTaskFilters(
                          tasks: allTasks,
                          selected: _filters,
                          onChanged: (field, choice) => setState(() {
                            if (choice == null) {
                              _filters.remove(field);
                            } else {
                              _filters[field] = choice;
                            }
                          }),
                        ),
                      ),
                    ),
                  if (!hasActive && _filters.isEmpty)
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.only(top: 24),
                        child: Center(
                          child: AppIllustration(AppIllustrationKind.noTasks),
                        ),
                      ),
                    ),
                  if (!hasActive)
                    SliverToBoxAdapter(
                      child: AppStateMessage.inline(
                        icon: _filters.isEmpty
                            ? LucideIcons.circleCheck
                            : LucideIcons.filter,
                        title: _filters.isEmpty
                            ? l10n.tasksAllCaughtUp
                            : l10n.tasksNoFilterMatches,
                        actionLabel: _filters.isEmpty
                            ? null
                            : l10n.taskBoardDetailClearFilters,
                        onAction: _filters.isEmpty
                            ? null
                            : () => setState(_filters.clear),
                      ),
                    ),
                  for (final section in TaskListSection.values)
                    if (section != TaskListSection.completed
                        ? hasActive
                        : filtered[section]!.isNotEmpty ||
                              state.hasMoreCompleted)
                      _section(context, section, filtered[section]!, state),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _section(
    BuildContext context,
    TaskListSection section,
    List<UserTask> tasks,
    TaskListState state,
  ) {
    final completed = section == TaskListSection.completed;
    final collapsed = switch (section) {
      TaskListSection.overdue => state.isOverdueCollapsed,
      TaskListSection.today => state.isTodayCollapsed,
      TaskListSection.upcoming => state.isUpcomingCollapsed,
      TaskListSection.noDate => state.isNoDateCollapsed,
      TaskListSection.completed => state.isCompletedCollapsed,
    };
    final cubit = context.read<TaskListCubit>();
    final count = completed && _filters.isEmpty
        ? (state.totalCompletedTasks > tasks.length
              ? state.totalCompletedTasks
              : tasks.length)
        : tasks.length;
    return SliverMainAxisGroup(
      key: ValueKey(section),
      slivers: [
        SliverToBoxAdapter(
          child: MyTaskSectionHeader(
            section: section,
            count: count,
            collapsed: collapsed,
            onToggle: tasks.isNotEmpty || completed && state.hasMoreCompleted
                ? () => cubit.toggleSection(section)
                : null,
          ),
        ),
        if (!collapsed)
          SliverList.builder(
            itemCount: tasks.length,
            itemBuilder: (context, index) {
              final task = tasks[index];
              return Padding(
                key: ValueKey(task.id),
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: MyTaskRow(
                  task: task,
                  workspaceId: widget.workspace.id,
                  now: _now,
                  completed: completed,
                  zone: _zone,
                  onOpen: userTaskBoardDetailLocation(task) == null
                      ? null
                      : () => unawaited(widget.onOpenTask(task)),
                  onComplete: () => _complete(task),
                  onSnooze: () => _snooze(task),
                ),
              );
            },
          ),
        if (completed && !collapsed && state.hasMoreCompleted)
          SliverToBoxAdapter(
            child: AppButton.outline(
              onPressed: state.isLoadingMoreCompleted
                  ? null
                  : cubit.loadMoreCompleted,
              loading: state.isLoadingMoreCompleted,
              child: Text(context.l10n.timerHistoryLoadMore),
            ),
          ),
      ],
    );
  }
}
