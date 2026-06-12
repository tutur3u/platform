import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/tasks/widgets/my_tasks_header.dart';
import 'package:mobile/features/tasks/widgets/task_section_accordion.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
import 'package:mobile/features/tasks_boards/cubit/task_boards_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_boards_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> _reload(BuildContext context) async {
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (ws == null) return;

  await context.read<TaskListCubit>().loadTasks(
    wsId: ws.id,
    isPersonal: ws.personal,
    forceRefresh: true,
    userId: context.read<AuthCubit>().state.user?.id,
  );
}

class TaskListPage extends StatelessWidget {
  const TaskListPage({
    super.key,
    this.taskRepository,
    this.settingsRepository,
  });

  final TaskRepository? taskRepository;
  final SettingsRepository? settingsRepository;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    if (workspace?.personal ?? false) {
      return _DefaultPersonalTaskBoardGate(
        workspaceId: workspace!.id,
        taskRepository: taskRepository,
        settingsRepository: settingsRepository,
      );
    }

    return _ClassicTaskListPage(taskRepository: taskRepository);
  }
}

class _ClassicTaskListPage extends StatelessWidget {
  const _ClassicTaskListPage({this.taskRepository});

  final TaskRepository? taskRepository;

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
          taskRepository: taskRepository ?? TaskRepository(),
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
        userId: context.read<AuthCubit>().state.user?.id,
      ),
    );
  }
}

class _DefaultPersonalTaskBoardGate extends StatefulWidget {
  const _DefaultPersonalTaskBoardGate({
    required this.workspaceId,
    this.taskRepository,
    this.settingsRepository,
  });

  final String workspaceId;
  final TaskRepository? taskRepository;
  final SettingsRepository? settingsRepository;

  @override
  State<_DefaultPersonalTaskBoardGate> createState() =>
      _DefaultPersonalTaskBoardGateState();
}

class _DefaultPersonalTaskBoardGateState
    extends State<_DefaultPersonalTaskBoardGate> {
  static final Map<String, String?> _memoryDefaultBoardIds = {};

  late final TaskRepository _taskRepository;
  late final SettingsRepository _settingsRepository;
  int _resolveToken = 0;
  String? _defaultBoardId;
  String? _pendingRedirectBoardId;
  bool _hasResolvedDefaultBoard = false;

  @override
  void initState() {
    super.initState();
    _taskRepository = widget.taskRepository ?? TaskRepository();
    _settingsRepository = widget.settingsRepository ?? SettingsRepository();
    _resolveDefaultBoardId(notify: false);
  }

  @override
  void didUpdateWidget(covariant _DefaultPersonalTaskBoardGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.workspaceId != widget.workspaceId) {
      _resolveDefaultBoardId(notify: true);
    }
  }

  void _resolveDefaultBoardId({required bool notify}) {
    final requestToken = ++_resolveToken;
    final workspaceId = widget.workspaceId;

    if (_memoryDefaultBoardIds.containsKey(workspaceId)) {
      _applyDefaultBoardId(
        _memoryDefaultBoardIds[workspaceId],
        notify: notify,
      );
      unawaited(_refreshDefaultBoardId(requestToken, workspaceId));
      return;
    }

    final seededState = TaskBoardsCubit.seedStateFor(workspaceId);
    final seededBoardId = seededState == null
        ? null
        : preferredPersonalTaskBoard(seededState.boards)?.id;
    if (seededBoardId != null) {
      _memoryDefaultBoardIds[workspaceId] = seededBoardId;
      _applyDefaultBoardId(seededBoardId, notify: notify);
      unawaited(
        _settingsRepository.setPersonalDefaultTaskBoardId(
          workspaceId,
          seededBoardId,
        ),
      );
      unawaited(_refreshDefaultBoardId(requestToken, workspaceId));
      return;
    }

    _applyUnresolvedDefaultBoard(notify: notify);
    unawaited(_loadPersistedThenRefresh(requestToken, workspaceId));
  }

  Future<void> _loadPersistedThenRefresh(
    int requestToken,
    String workspaceId,
  ) async {
    final persistedBoardId = await _settingsRepository
        .getPersonalDefaultTaskBoardId(workspaceId);
    if (!mounted || requestToken != _resolveToken) {
      return;
    }

    final normalizedBoardId = _normalizeBoardId(persistedBoardId);
    _memoryDefaultBoardIds[workspaceId] = normalizedBoardId;
    _applyDefaultBoardId(normalizedBoardId, notify: true);
    unawaited(_refreshDefaultBoardId(requestToken, workspaceId));
  }

  Future<void> _refreshDefaultBoardId(
    int requestToken,
    String workspaceId,
  ) async {
    try {
      final page = await _taskRepository.getTaskBoards(
        workspaceId,
        pageSize: 50,
        status: 'active',
      );
      final boardId = preferredPersonalTaskBoard(page.boards)?.id;
      _memoryDefaultBoardIds[workspaceId] = boardId;
      await _settingsRepository.setPersonalDefaultTaskBoardId(
        workspaceId,
        boardId,
      );
      if (!mounted || requestToken != _resolveToken) {
        return;
      }
      _applyDefaultBoardId(boardId, notify: true);
    } on Object {
      if (!mounted ||
          requestToken != _resolveToken ||
          _hasResolvedDefaultBoard) {
        return;
      }
      _applyDefaultBoardId(null, notify: true);
    }
  }

  void _applyUnresolvedDefaultBoard({required bool notify}) {
    if (!notify) {
      _defaultBoardId = null;
      _hasResolvedDefaultBoard = false;
      _pendingRedirectBoardId = null;
      return;
    }

    if (!mounted) return;
    setState(() {
      _defaultBoardId = null;
      _hasResolvedDefaultBoard = false;
      _pendingRedirectBoardId = null;
    });
  }

  void _applyDefaultBoardId(String? boardId, {required bool notify}) {
    final normalizedBoardId = _normalizeBoardId(boardId);
    if (_hasResolvedDefaultBoard && _defaultBoardId == normalizedBoardId) {
      return;
    }

    if (!notify) {
      _defaultBoardId = normalizedBoardId;
      _hasResolvedDefaultBoard = true;
      _pendingRedirectBoardId = null;
      return;
    }

    if (!mounted) return;
    setState(() {
      _defaultBoardId = normalizedBoardId;
      _hasResolvedDefaultBoard = true;
      _pendingRedirectBoardId = null;
    });
  }

  String? _normalizeBoardId(String? boardId) {
    final trimmed = boardId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    return trimmed;
  }

  void _scheduleBoardRedirect(String boardId) {
    if (_pendingRedirectBoardId == boardId) {
      return;
    }
    _pendingRedirectBoardId = boardId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _pendingRedirectBoardId != boardId) {
        return;
      }
      _pendingRedirectBoardId = null;
      context.go(
        taskBoardViewLocation(
          boardId: boardId,
          view: taskBoardDetailViewList,
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final boardId = _defaultBoardId;
    if (boardId != null) {
      _scheduleBoardRedirect(boardId);
    }
    return TaskBoardsPage(taskRepository: _taskRepository);
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
      child: MultiBlocListener(
        listeners: [
          BlocListener<WorkspaceCubit, WorkspaceState>(
            listenWhen: (prev, curr) =>
                prev.currentWorkspace?.id != curr.currentWorkspace?.id,
            listener: (context, state) {
              final ws = state.currentWorkspace;
              if (ws == null) return;

              unawaited(
                context.read<TaskListCubit>().loadTasks(
                  wsId: ws.id,
                  isPersonal: ws.personal,
                  userId: context.read<AuthCubit>().state.user?.id,
                ),
              );
            },
          ),
          BlocListener<AuthCubit, AuthState>(
            listenWhen: (previous, current) =>
                previous.user?.id != current.user?.id,
            listener: (context, state) {
              final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
              if (ws == null) return;

              unawaited(
                context.read<TaskListCubit>().loadTasks(
                  wsId: ws.id,
                  isPersonal: ws.personal,
                  forceRefresh: true,
                  userId: state.user?.id,
                ),
              );
            },
          ),
        ],
        child: BlocBuilder<TaskListCubit, TaskListState>(
          builder: (context, state) {
            if (state.status == TaskListStatus.loading &&
                state.totalActiveTasks == 0 &&
                state.completedTasks.isEmpty) {
              return const Center(child: NovaLoadingIndicator());
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
                    const SizedBox(height: 14),
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
                    if (state.todayTasks.isNotEmpty) const SizedBox(height: 12),
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
                      const SizedBox(height: 12),
                    if (state.totalActiveTasks == 0) const _AllCaughtUpView(),
                    if (state.totalActiveTasks == 0) const SizedBox(height: 12),
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
                        child: Center(child: NovaLoadingIndicator()),
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
    return TaskSurfaceMessageCard(
      icon: Icons.check_rounded,
      title: l10n.tasksAllCaughtUp,
      description: l10n.tasksAllCaughtUpSubtitle,
      accentColor: Colors.green.shade700,
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
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: TaskSurfaceMessageCard(
          icon: Icons.error_outline,
          title: l10n.tasksLoadError,
          description: error ?? l10n.commonSomethingWentWrong,
          accentColor: shad.Theme.of(context).colorScheme.destructive,
          action: shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}
