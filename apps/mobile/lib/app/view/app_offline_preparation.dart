part of 'app.dart';

extension _AppOfflinePreparation on _AppState {
  void _registerOfflinePreparation() {
    OfflinePreparationCoordinator.instance
      ..verifyRetention = OfflineDownloadManifest.verifyScope
      ..register(
        'finance',
        (wsId) =>
            _prepareWithPermissions(wsId, _financeRepository.prepareOffline),
      )
      ..register(
        'tasks',
        (wsId) => _prepareWithPermissions(wsId, _taskRepository.prepareOffline),
      )
      ..register(
        'calendar',
        (wsId) =>
            _prepareWithPermissions(wsId, _calendarRepository.prepareOffline),
      )
      ..register('inventory', (workspaceId) async {
        if (!await _inventoryAccessRepository.isInventoryEnabled(workspaceId)) {
          throw const OfflinePreparationUnavailable();
        }
        await _prepareWithPermissions(
          workspaceId,
          _inventoryRepository.prepareOffline,
        );
      });
    CacheStore.instance.resourceRemovalRevision.addListener(
      _invalidateOfflineReadiness,
    );
    _syncOfflinePreparationScope();
  }

  Future<void> _prepareWithPermissions(
    String workspaceId,
    Future<void> Function(String) prepare,
  ) async {
    await WorkspacePermissionsRepository().prepareOffline(workspaceId);
    await prepare(workspaceId);
  }

  void _invalidateOfflineReadiness() {
    final coordinator = OfflinePreparationCoordinator.instance;
    if (!coordinator.state.value.running &&
        coordinator.state.value.completed > 0) {
      coordinator.invalidateRetainedData();
    }
  }

  void _syncOfflinePreparationScope({bool resetWorkspace = false}) {
    unawaited(
      OfflinePreparationCoordinator.instance.setScope(
        userId: _authCubit.state.user?.id,
        workspaceId: resetWorkspace
            ? null
            : _workspaceCubit.state.currentWorkspace?.id,
      ),
    );
  }

  void _unregisterOfflinePreparation() {
    CacheStore.instance.resourceRemovalRevision.removeListener(
      _invalidateOfflineReadiness,
    );
    final coordinator = OfflinePreparationCoordinator.instance;
    OfflinePreparationCoordinator.productIds.forEach(coordinator.unregister);
    coordinator.verifyRetention = null;
    unawaited(coordinator.setScope());
  }

  void _registerWarmupTasks() {
    _registerInventoryWarmupTask();
    CacheWarmupCoordinator.instance.register('home_payload', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await Future.wait([
        TaskListCubit.prewarm(
          taskRepository: _taskRepository,
          wsId: workspace.id,
          isPersonal: workspace.personal,
          forceRefresh: forceRefresh,
        ),
        CalendarCubit.prewarm(
          calendarRepository: _calendarRepository,
          wsId: workspace.id,
          forceRefresh: forceRefresh,
        ),
      ]);
    });
    CacheWarmupCoordinator.instance.register('assistant_metadata', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await _assistantRepository.prewarmWorkspace(
        wsId: workspace.id,
        isPersonal: workspace.personal,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register(
      'apps_registry',
      ({forceRefresh = false}) async {},
    );
    CacheWarmupCoordinator.instance.register('tasks_list', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await TaskListCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: workspace.id,
        isPersonal: workspace.personal,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('task_boards', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await TaskBoardsCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('task_estimates', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await TaskEstimatesCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('task_labels', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await TaskLabelsCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('task_portfolio', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await TaskPortfolioCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('calendar_root', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await CalendarCubit.prewarm(
        calendarRepository: _calendarRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('finance_overview', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      await FinanceCubit.prewarm(
        financeRepository: _financeRepository,
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register(
      'finance_transactions',
      ({forceRefresh = false}) async {},
    );
    CacheWarmupCoordinator.instance.register('habits_overview', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      final accessState = _habitsAccessCubit.state;
      if (accessState.wsId != workspace.id ||
          accessState.status != HabitsAccessStatus.loaded ||
          !accessState.enabled) {
        return;
      }
      await HabitsCubit.prewarm(
        repository: HabitTrackerRepository(),
        wsId: workspace.id,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('habits_activity', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      if (workspace == null) return;
      final accessState = _habitsAccessCubit.state;
      if (accessState.wsId != workspace.id ||
          accessState.status != HabitsAccessStatus.loaded ||
          !accessState.enabled) {
        return;
      }
      await HabitsCubit.prewarm(
        repository: HabitTrackerRepository(),
        wsId: workspace.id,
        includeActivity: true,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('time_tracker_root', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      final userId = _authCubit.state.user?.id;
      if (workspace == null || userId == null || userId.isEmpty) return;
      await TimeTrackerCubit.prewarm(
        repository: _timeTrackerRepository,
        wsId: workspace.id,
        userId: userId,
        forceRefresh: forceRefresh,
      );
    });
    CacheWarmupCoordinator.instance.register('time_tracker_requests', ({
      forceRefresh = false,
    }) async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      final userId = _authCubit.state.user?.id;
      if (workspace == null || userId == null || userId.isEmpty) return;
      await TimeTrackerRequestsCubit.prewarm(
        workspace.id,
        repository: _timeTrackerRepository,
        selectedUserId: userId,
        statusFilter: 'pending',
        forceRefresh: forceRefresh,
      );
    });
  }
}
