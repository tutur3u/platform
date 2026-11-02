part of 'app.dart';

extension _AppOfflinePreparation on _AppState {
  void _registerOfflinePreparation() {
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _mobileFlags.setForeground(
      foreground: lifecycle == null || lifecycle == AppLifecycleState.resumed,
    );
    OfflinePreparationCoordinator.instance
      ..registry = OfflinePreparerRegistry(isEnabled: _mobileFlags.enabled)
      ..verifyRetention = OfflineDownloadManifest.verifyScope
      ..verifyProductRetention = (user, workspace, product) async {
        if (product == 'mastermind') {
          if (_authCubit.state.user?.id != user ||
              _mastermind.access.state.wsId != workspace ||
              !_mastermind.access.state.visible) {
            throw const OfflinePreparationUnavailable();
          }
          await _mastermind.snapshot.verifyOffline();
        } else {
          await OfflineDownloadManifest.verifyProduct(user, workspace, product);
        }
      }
      ..registry.register(
        'finance',
        null,
        (wsId) =>
            _prepareWithPermissions(wsId, _financeRepository.prepareOffline),
      )
      ..registry.register(
        'tasks',
        null,
        (wsId) => _prepareWithPermissions(wsId, _taskRepository.prepareOffline),
      )
      ..registry.register(
        'calendar',
        null,
        (wsId) =>
            _prepareWithPermissions(wsId, _calendarRepository.prepareOffline),
      )
      ..registry.register('inventory', null, (workspaceId) async {
        if (!await _inventoryAccessRepository.isInventoryEnabled(workspaceId)) {
          throw const OfflinePreparationUnavailable();
        }
        await _prepareWithPermissions(
          workspaceId,
          _inventoryRepository.prepareOffline,
        );
      });
    void registerTimeTracker() => TimeTrackerOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient();
        try {
          await _calendarSettingsCubit.loadWorkspacePreference(wsId);
          final locale =
              _localeCubit.state.locale ??
              WidgetsBinding.instance.platformDispatcher.locale;
          await TimeTrackerOfflinePreparation(
            api: api,
            firstDayOfWeek: timeTrackerFirstDayOfWeek(
              _calendarSettingsCubit.state,
              locale.languageCode,
            ),
          ).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    void registerHabits() => HabitsOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient(baseUrl: ApiConfig.tasksBaseUrl);
        try {
          await HabitsOfflinePreparation(api: api).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    registerTimeTracker();
    _timeTrackerOfflineFlags = _mobileFlags.stream.listen(
      (_) => registerTimeTracker(),
    );
    registerHabits();
    _habitsOfflineFlags = _mobileFlags.stream.listen((_) => registerHabits());
    void registerChat() => ChatOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient();
        try {
          await ChatOfflinePreparation(api: api).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    void registerNotes() => NotesOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient();
        try {
          await NotesOfflinePreparation(api: api).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    void registerMira() => MiraOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient();
        try {
          await MiraOfflinePreparation(api: api).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    void registerDocuments() => DocumentsOfflinePreparation.register(
      OfflinePreparationCoordinator.instance.registry,
      (wsId) => _prepareWithPermissions(wsId, (wsId) async {
        final api = ApiClient();
        try {
          await DocumentsOfflinePreparation(api: api).prepare(wsId);
        } finally {
          api.dispose();
        }
      }),
    );
    registerNotes();
    registerMira();
    registerDocuments();
    registerChat();
    _chatOfflineFlags = _mobileFlags.stream.listen((_) {
      registerChat();
      registerNotes();
      registerMira();
      registerDocuments();
    });
    CacheStore.instance.removedResource.addListener(
      _invalidateOfflineReadiness,
    );
    _syncOfflinePreparationScope();
  }

  void _registerFlaggedOfflineProducts(MobileFlagsState flags) {
    _mastermind.registerOfflinePreparation(
      OfflinePreparationCoordinator.instance.registry,
      flags,
    );
    registerHomeOffline(
      OfflinePreparationCoordinator.instance.registry,
      flags,
      (wsId) => _prepareWithPermissions(wsId, _prepareHomeOffline),
    );
  }

  Future<void> _prepareHomeOffline(String wsId) => retainHomeOffline(
    wsId,
    warm: () async {
      final workspace = _workspaceCubit.state.currentWorkspace;
      final user = _authCubit.state.user?.id;
      if (workspace?.id != wsId || user == null) {
        throw const OfflinePreparationUnavailable();
      }
      await TaskListCubit.prewarm(
        taskRepository: _taskRepository,
        wsId: wsId,
        isPersonal: workspace!.personal,
        forceRefresh: true,
      );
      await CalendarCubit.prewarm(
        calendarRepository: _calendarRepository,
        wsId: wsId,
        forceRefresh: true,
      );
      final keys = [
        TaskListCubit.offlineSummaryKey(wsId, isPersonal: workspace.personal),
        CalendarCubit.offlineSummaryKey(wsId),
      ];
      if (_audienceModeCubit.state.mode == AudienceMode.education) {
        final day = DateTime.now();
        await SessionsClassesTodayRepository().fetch(
          userId: user,
          wsId: wsId,
          day: day,
          scope: ClassScope.mine,
        );
        keys.add(
          SessionsClassesTodayRepository.offlineSummaryKey(user, wsId, day),
        );
      }
      return keys;
    },
  );

  Future<void> _prepareWithPermissions(
    String workspaceId,
    Future<void> Function(String) prepare,
  ) async {
    await WorkspacePermissionsRepository().prepareOffline(workspaceId);
    await prepare(workspaceId);
  }

  void _invalidateOfflineReadiness() {
    final coordinator = OfflinePreparationCoordinator.instance;
    final removed = CacheStore.instance.removedResource.value;
    final scope = coordinator.state.value;
    final sharedRates =
        removed?.workspaceId == 'global' &&
        removed?.namespace == 'finance.exchangeRates';
    if (removed == null ||
        removed.userId == null ||
        scope.workspaceId == null ||
        removed.userId != scope.userId ||
        (!sharedRates && removed.workspaceId != scope.workspaceId)) {
      return;
    }
    if (scope.running || scope.completed > 0) {
      coordinator.invalidateRetainedData(
        productIds: OfflineDownloadManifest.affectedProducts(
          userId: removed.userId!,
          workspaceId: scope.workspaceId!,
          key: removed.key,
          namespace: removed.namespace,
        ),
      );
    }
  }

  Future<void> _refreshOfflinePreparationOnResume() async {
    final userId = _authCubit.state.user?.id;
    final workspaceId = _workspaceCubit.state.currentWorkspace?.id;
    final auth = _authCubit.state;
    final revision = OfflinePreparationCoordinator.instance.scopeRevision;
    await _authCubit.refreshAccountAssurance();
    if (!mounted ||
        revision != OfflinePreparationCoordinator.instance.scopeRevision ||
        auth.status != AuthStatus.authenticated ||
        userId == null ||
        workspaceId == null ||
        _authCubit.state.status != AuthStatus.authenticated ||
        _authCubit.state.user?.id != userId ||
        _workspaceCubit.state.currentWorkspace?.id != workspaceId) {
      return;
    }
    _syncOfflinePreparationScope();
  }

  void _syncOfflinePreparationScope({bool resetWorkspace = false}) {
    final auth = _authCubit.state;
    final userId = auth.user?.id;
    final workspaceId = resetWorkspace
        ? null
        : _workspaceCubit.state.currentWorkspace?.id;
    unawaited(
      _mobileFlags
          .setScope(
            userId: auth.status == AuthStatus.authenticated ? userId : null,
            workspaceId: workspaceId,
          )
          .catchError((Object error) {
            debugPrint('Mobile flags cache scope reset failed: $error');
          }),
    );
    final coordinator = OfflinePreparationCoordinator.instance;
    unawaited(
      _calendarSettingsCubit.load(
        userId: auth.status == AuthStatus.authenticated ? userId : null,
        workspaceId: workspaceId,
      ),
    );
    unawaited(
      coordinator
          .setScope(userId: userId, workspaceId: workspaceId)
          .then((_) async {
            if (!mounted ||
                !identical(auth, _authCubit.state) ||
                auth.status != AuthStatus.authenticated ||
                userId == null ||
                workspaceId == null ||
                _workspaceCubit.state.currentWorkspace?.id != workspaceId) {
              return;
            }
            await coordinator.resumePending(
              userId: userId,
              workspaceId: workspaceId,
            );
          })
          .catchError((Object _) {
            // A failed plan stays pending; the Offline screen offers retry.
          }),
    );
  }

  void _unregisterOfflinePreparation() {
    unawaited(_timeTrackerOfflineFlags?.cancel());
    OfflinePreparationCoordinator.instance.unregister('time_tracker');
    unawaited(_habitsOfflineFlags?.cancel());
    OfflinePreparationCoordinator.instance.unregister('habits');
    CacheStore.instance.removedResource.removeListener(
      _invalidateOfflineReadiness,
    );
    final coordinator = OfflinePreparationCoordinator.instance;
    OfflinePreparationCoordinator.productIds.forEach(coordinator.unregister);
    coordinator
      ..verifyRetention = null
      ..verifyProductRetention = null;
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
