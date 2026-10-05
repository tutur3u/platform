part of 'time_tracker_cubit.dart';

class _TimerLoadScope {
  _TimerLoadScope(this.cubit, this.wsId, this.userId, this.token)
    : key = TimeTrackerCubit._cacheKey(wsId, userId, actorId: cubit._ownerId);
  final TimeTrackerCubit cubit;
  final String wsId;
  final String userId;
  final int token;
  final CacheKey key;
  bool get active =>
      cubit._ownerActive &&
      cubit._loadDataRequestToken == token &&
      cubit._activeWorkspaceId == wsId &&
      cubit._activeUserId == userId;
  void check() {
    if (!active) throw const _TimerScopeChanged();
  }
}

class _TimerScopeChanged implements Exception {
  const _TimerScopeChanged();
}

extension _TimerScopedLoading on TimeTrackerCubit {
  _TimerLoadScope? _captureLoadScope() {
    final wsId = _activeWorkspaceId;
    final userId = _activeUserId;
    if (wsId == null || userId == null || wsId.isEmpty || userId.isEmpty) {
      return null;
    }
    return _TimerLoadScope(this, wsId, userId, _loadDataRequestToken);
  }

  Future<void> _loadScopedData(
    String wsId,
    String userId, {
    int? firstDayOfWeek,
    bool forceRefresh = false,
    bool throwOnError = false,
  }) async {
    if (!_ownerActive) return;
    if (_activeWorkspaceId != null &&
        (_activeWorkspaceId != wsId || _activeUserId != userId)) {
      prepareForWorkspaceSwitch();
    }
    final effectiveFirstDayOfWeek = firstDayOfWeek ?? _historyFirstDayOfWeek;
    _historyFirstDayOfWeek = effectiveFirstDayOfWeek;
    _activeWorkspaceId = wsId;
    _activeUserId = userId;
    ++_loadDataRequestToken;
    final scope = _captureLoadScope()!;
    _goalsWorkspaceRequestToken++;
    _goalsRequestVersionByWs.clear();
    final requestedHistoryViewMode = state.historyViewMode;
    final requestedHistoryAnchorDate = state.historyAnchorDate == null
        ? null
        : DateTime(
            state.historyAnchorDate!.year,
            state.historyAnchorDate!.month,
            state.historyAnchorDate!.day,
          );
    final cached = _cachedStateFor(wsId: wsId, userId: userId);
    final cachedRead = await _store.read<Map<String, dynamic>>(
      key: scope.key,
      decode: TimeTrackerCubit._decodeCacheJson,
    );

    if (!scope.active) return;
    if (cached != null) {
      final effectiveHistoryAnchorDate =
          requestedHistoryAnchorDate ?? cached.historyAnchorDate;
      final shouldRefreshForHistoryContext =
          requestedHistoryViewMode != cached.historyViewMode ||
          !_isSameCalendarDay(
            requestedHistoryAnchorDate,
            cached.historyAnchorDate,
          );
      _publish(
        cached.copyWith(
          historyViewMode: requestedHistoryViewMode,
          historyAnchorDate: effectiveHistoryAnchorDate,
          historySessions: shouldRefreshForHistoryContext
              ? const []
              : cached.historySessions,
          historyHasMore:
              !shouldRefreshForHistoryContext && cached.historyHasMore,
          clearHistoryNextCursor: shouldRefreshForHistoryContext,
          clearHistoryPeriodStats: shouldRefreshForHistoryContext,
          isHistoryLoading: shouldRefreshForHistoryContext,
          isHistoryLoadingMore: false,
          status: TimeTrackerStatus.loaded,
          isFromCache: true,
          isRefreshing: true,
          lastUpdatedAt: cachedRead.fetchedAt,
          clearError: true,
        ),
      );
      if (cached.runningSession != null && !cached.isPaused) {
        _startTick();
      }
    } else {
      _publish(
        state.copyWith(
          status: TimeTrackerStatus.loading,
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: null,
          clearError: true,
        ),
      );
    }

    try {
      await _ensureHistoryPreferencesLoaded();
      if (!scope.active) return;
      final anchorDate = _currentHistoryAnchorDate();
      final timezone = await getCurrentTimezoneIdentifier();
      if (!scope.active) return;
      final periodRange = _historyPeriodRange(
        state.historyViewMode,
        anchorDate,
        firstDayOfWeek: effectiveFirstDayOfWeek,
      );
      final normalizedUserId = _normalizeUserId(userId);
      final runningSessionFuture = _repo.getRunningSession(wsId);
      final categoriesFuture = _repo.getCategories(wsId);
      final recentSessionsFuture = _repo.getSessions(wsId, limit: 5);
      final statsFuture = _repo.getStats(wsId, userId, timezone: timezone);
      final historyPageFuture = _repo.getHistorySessions(
        wsId,
        dateFrom: periodRange.start,
        dateTo: periodRange.end,
        userId: normalizedUserId,
      );
      final historyPeriodStatsFuture = _repo.getPeriodStats(
        wsId,
        dateFrom: periodRange.start,
        dateTo: periodRange.end,
        userId: normalizedUserId,
        timezone: timezone,
      );
      final pomodoroSettingsFuture = _repo.loadPomodoroSettings();
      final workspaceSettingsFuture = _safeGetWorkspaceSettings(wsId);

      // Attach failure handlers to every parallel read before awaiting one.
      // A later source can reject while an earlier request is still pending.
      await Future.wait<Object?>([
        runningSessionFuture,
        categoriesFuture,
        recentSessionsFuture,
        statsFuture,
        historyPageFuture,
        historyPeriodStatsFuture,
        pomodoroSettingsFuture,
        workspaceSettingsFuture,
      ]);
      if (!scope.active) return;
      final runningSession = await runningSessionFuture;
      final categories = await categoriesFuture;
      final recentSessions = await recentSessionsFuture;
      final stats = await statsFuture;
      final historyPage = await historyPageFuture;
      final historyPeriodStats = await historyPeriodStatsFuture;
      final pomodoroSettings = await pomodoroSettingsFuture;
      final workspaceSettings = await workspaceSettingsFuture;

      if (!scope.active) return;
      TimeTrackingBreak? activeBreak;
      if (runningSession != null) {
        activeBreak = await _repo.getActiveBreak(wsId, runningSession.id);
      }

      if (!scope.active) return;
      final isPaused =
          runningSession != null &&
          !runningSession.isRunning &&
          activeBreak != null;
      final runningStartTime = runningSession?.startTime;
      final elapsed = runningStartTime != null && !isPaused
          ? DateTime.now().difference(runningStartTime)
          : Duration.zero;

      // Fetch task display info separately if the running session has a task.
      TaskLinkOption? runningTaskOption;
      final taskId = runningSession?.taskId;
      if (taskId != null && taskId.isNotEmpty) {
        try {
          runningTaskOption = await _repo.getTaskLinkOptionById(wsId, taskId);
          if (!scope.active) return;
        } on Exception catch (e) {
          developer.log(
            'Failed to load running session task info',
            name: 'TimeTrackerCubit',
            error: e,
          );
        }
      }

      if (!scope.active) return;
      _publish(
        state.copyWith(
          status: TimeTrackerStatus.loaded,
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: DateTime.now(),
          runningSession: runningSession,
          activeBreak: activeBreak,
          elapsed: elapsed,
          recentSessions: recentSessions,
          historyAnchorDate: anchorDate,
          historySessions: historyPage.sessions,
          historyPeriodStats: historyPeriodStats,
          historyHasMore: historyPage.hasMore,
          historyNextCursor: historyPage.nextCursor,
          isHistoryLoading: false,
          isHistoryLoadingMore: false,
          categories: categories,
          clearGoals: true,
          clearGoalsLoaded: true,
          goalsWorkspaceId: null,
          goalsLoadingByWs: const {},
          goalsLoadedByWs: const {},
          stats: stats,
          pomodoroSettings: pomodoroSettings,
          thresholdDays: workspaceSettings?.missedEntryDateThreshold,
          isPaused: isPaused,
          clearRunningSession: runningSession == null,
          clearActiveBreak: activeBreak == null,
          runningSessionTaskName: runningTaskOption?.name,
          runningSessionTaskTicketLabel: runningTaskOption?.ticketLabel,
          clearRunningSessionTask: runningTaskOption == null,
          clearError: true,
        ),
      );
      await _store.write(
        key: scope.key,
        policy: TimeTrackerCubit._cachePolicy,
        payload: TimeTrackerCubit._stateToCachePayload(state),
        tags: [TimeTrackerCubit._cacheTag, 'workspace:$wsId', 'module:timer'],
        checkScope: scope.check,
      );
      if (!scope.active) return;

      if (runningSession != null && !isPaused) {
        _startTick();
      }
    } on Exception catch (e) {
      if (!scope.active) return;
      if (cached != null) {
        _publish(
          state.copyWith(
            status: TimeTrackerStatus.loaded,
            isRefreshing: false,
            isHistoryLoading: false,
            isHistoryLoadingMore: false,
            error: e.toString(),
          ),
        );
        if (throwOnError) {
          rethrow;
        }
        return;
      }
      _publish(
        state.copyWith(status: TimeTrackerStatus.error, error: e.toString()),
      );
      if (throwOnError) {
        rethrow;
      }
    }
  }
}
