import 'dart:async';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/threshold.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TimeTrackerCubit extends Cubit<TimeTrackerState> {
  TimeTrackerCubit({
    required ITimeTrackerRepository repository,
    TimeTrackerState? initialState,
  }) : _repo = repository,
       super(initialState ?? const TimeTrackerState());

  final ITimeTrackerRepository _repo;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'time-tracker:root';
  Timer? _ticker;
  static const _historyStatsAccordionPrefsKey =
      'time_tracker_history_stats_open';
  Future<void>? _historyPreferencesLoadFuture;
  int _historyFirstDayOfWeek = DateTime.monday;
  int _goalsWorkspaceRequestToken = 0;
  int _loadDataRequestToken = 0;
  String? _activeWorkspaceId;
  String? _activeUserId;
  final Map<String, int> _goalsRequestVersionByWs = <String, int>{};

  static CacheKey _cacheKey(String wsId, String userId) {
    return CacheKey(
      namespace: 'time_tracker.root',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'scopeUserId': userId},
    );
  }

  static Map<String, dynamic> _breakToJson(TimeTrackingBreak item) {
    return {
      'id': item.id,
      'session_id': item.sessionId,
      'break_type_id': item.breakTypeId,
      'break_type_name': item.breakTypeName,
      'break_start': item.breakStart?.toIso8601String(),
      'break_end': item.breakEnd?.toIso8601String(),
      'break_duration_seconds': item.breakDurationSeconds,
      'notes': item.notes,
      'created_by': item.createdBy,
    };
  }

  static Map<String, dynamic> _dailyActivityToJson(DailyActivity item) {
    return {
      'date': item.date.toIso8601String(),
      'duration': item.duration,
      'sessions': item.sessions,
    };
  }

  static Map<String, dynamic> _statsToJson(TimeTrackerStats stats) {
    return {
      'today_time': stats.todayTime,
      'week_time': stats.weekTime,
      'month_time': stats.monthTime,
      'streak': stats.streak,
      'daily_activity': stats.dailyActivity
          .map(_dailyActivityToJson)
          .toList(growable: false),
    };
  }

  static Map<String, dynamic> _periodStatsToJson(
    TimeTrackingPeriodStats stats,
  ) {
    return {
      'totalDuration': stats.totalDuration,
      'sessionCount': stats.sessionCount,
      'breakdown': stats.breakdown
          .map(
            (entry) => {
              'name': entry.name,
              'duration': entry.duration,
              'color': entry.color,
            },
          )
          .toList(growable: false),
    };
  }

  static Map<String, dynamic> _stateToCachePayload(TimeTrackerState state) {
    return {
      'runningSession': state.runningSession?.toJson(),
      'activeBreak': state.activeBreak == null
          ? null
          : _breakToJson(state.activeBreak!),
      'recentSessions': state.recentSessions
          .map((session) => session.toJson())
          .toList(growable: false),
      'categories': state.categories
          .map((category) => category.toJson())
          .toList(growable: false),
      'stats': state.stats == null ? null : _statsToJson(state.stats!),
      'historyViewMode': state.historyViewMode.name,
      'historyAnchorDate': state.historyAnchorDate?.toIso8601String(),
      'historySessions': state.historySessions
          .map((session) => session.toJson())
          .toList(growable: false),
      'historyPeriodStats': state.historyPeriodStats == null
          ? null
          : _periodStatsToJson(state.historyPeriodStats!),
      'historyNextCursor': state.historyNextCursor,
      'historyHasMore': state.historyHasMore,
      'isHistoryStatsAccordionOpen': state.isHistoryStatsAccordionOpen,
      'pomodoroSettings': state.pomodoroSettings.toJson(),
      'thresholdDays': state.thresholdDays,
      'isPaused': state.isPaused,
      'runningSessionTaskName': state.runningSessionTaskName,
      'runningSessionTaskTicketLabel': state.runningSessionTaskTicketLabel,
    };
  }

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid time tracker cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static TimeTrackerState? seedStateFor({
    required String wsId,
    required String userId,
  }) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(wsId, userId),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    final runningSessionJson = json['runningSession'];
    final activeBreakJson = json['activeBreak'];
    final runningSession = runningSessionJson is Map<String, dynamic>
        ? TimeTrackingSession.fromJson(runningSessionJson)
        : null;
    final activeBreak = activeBreakJson is Map<String, dynamic>
        ? TimeTrackingBreak.fromJson(activeBreakJson)
        : null;
    final isPaused = json['isPaused'] as bool? ?? false;
    final runningStartTime = runningSession?.startTime;
    final elapsed = runningStartTime != null && !isPaused
        ? DateTime.now().difference(runningStartTime)
        : Duration.zero;

    return TimeTrackerState(
      status: TimeTrackerStatus.loaded,
      isFromCache: true,
      lastUpdatedAt: cached.fetchedAt,
      runningSession: runningSession,
      activeBreak: activeBreak,
      elapsed: elapsed,
      recentSessions:
          ((json['recentSessions'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TimeTrackingSession.fromJson)
              .toList(growable: false),
      categories: ((json['categories'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TimeTrackingCategory.fromJson)
          .toList(growable: false),
      stats: json['stats'] is Map<String, dynamic>
          ? TimeTrackerStats.fromJson(json['stats'] as Map<String, dynamic>)
          : null,
      historyViewMode: HistoryViewMode.values.firstWhere(
        (mode) => mode.name == json['historyViewMode'],
        orElse: () => HistoryViewMode.week,
      ),
      historyAnchorDate: json['historyAnchorDate'] is String
          ? DateTime.tryParse(json['historyAnchorDate'] as String)
          : null,
      historySessions:
          ((json['historySessions'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TimeTrackingSession.fromJson)
              .toList(growable: false),
      historyPeriodStats: json['historyPeriodStats'] is Map<String, dynamic>
          ? TimeTrackingPeriodStats.fromJson(
              json['historyPeriodStats'] as Map<String, dynamic>,
            )
          : null,
      historyNextCursor: json['historyNextCursor'] as String?,
      historyHasMore: json['historyHasMore'] as bool? ?? false,
      isHistoryStatsAccordionOpen:
          json['isHistoryStatsAccordionOpen'] as bool? ?? false,
      pomodoroSettings: json['pomodoroSettings'] is Map<String, dynamic>
          ? PomodoroSettings.fromJson(
              json['pomodoroSettings'] as Map<String, dynamic>,
            )
          : const PomodoroSettings(),
      thresholdDays: json['thresholdDays'] as int?,
      isPaused: isPaused,
      runningSessionTaskName: json['runningSessionTaskName'] as String?,
      runningSessionTaskTicketLabel:
          json['runningSessionTaskTicketLabel'] as String?,
    );
  }

  static Future<void> prewarm({
    required ITimeTrackerRepository repository,
    required String wsId,
    required String userId,
    bool forceRefresh = false,
  }) async {
    await CacheStore.instance.prefetch<Map<String, dynamic>>(
      key: _cacheKey(wsId, userId),
      policy: _cachePolicy,
      decode: _decodeCacheJson,
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:timer'],
      fetch: () async {
        final now = DateTime.now();
        final weekStart = DateTime(
          now.year,
          now.month,
          now.day,
        ).subtract(Duration(days: now.weekday - DateTime.monday));
        final weekEnd = weekStart.add(const Duration(days: 7));
        final normalizedUserId = userId.trim().isEmpty ? null : userId;
        final timezone = await getCurrentTimezoneIdentifier();
        final runningSessionFuture = repository.getRunningSession(wsId);
        final categoriesFuture = repository.getCategories(wsId);
        final recentSessionsFuture = repository.getSessions(wsId, limit: 5);
        final statsFuture = repository.getStats(
          wsId,
          userId,
          timezone: timezone,
        );
        final historyPageFuture = repository.getHistorySessions(
          wsId,
          dateFrom: weekStart,
          dateTo: weekEnd,
          userId: normalizedUserId,
        );
        final historyStatsFuture = repository.getPeriodStats(
          wsId,
          dateFrom: weekStart,
          dateTo: weekEnd,
          userId: normalizedUserId,
          timezone: timezone,
        );
        final pomodoroFuture = repository.loadPomodoroSettings();
        final settingsFuture = repository.getWorkspaceSettings(wsId);

        final runningSession = await runningSessionFuture;
        TimeTrackingBreak? activeBreak;
        if (runningSession != null) {
          activeBreak = await repository.getActiveBreak(
            wsId,
            runningSession.id,
          );
        }

        final historyPage = await historyPageFuture;
        final state = TimeTrackerState(
          status: TimeTrackerStatus.loaded,
          runningSession: runningSession,
          activeBreak: activeBreak,
          recentSessions: await recentSessionsFuture,
          categories: await categoriesFuture,
          stats: await statsFuture,
          historyAnchorDate: now,
          historySessions: historyPage.sessions,
          historyPeriodStats: await historyStatsFuture,
          historyHasMore: historyPage.hasMore,
          historyNextCursor: historyPage.nextCursor,
          pomodoroSettings: await pomodoroFuture,
          thresholdDays: (await settingsFuture)?.missedEntryDateThreshold,
          isPaused:
              runningSession != null &&
              !runningSession.isRunning &&
              activeBreak != null,
        );

        return _stateToCachePayload(state);
      },
    );
  }

  Map<String, bool> _setGoalFlag(
    Map<String, bool> source,
    String wsId,
    bool value,
  ) => <String, bool>{...source, wsId: value};

  TimeTrackerState? _cachedStateFor({
    required String wsId,
    required String userId,
  }) {
    final cachedState = seedStateFor(wsId: wsId, userId: userId);
    if (cachedState == null) {
      return null;
    }

    return cachedState.copyWith(
      goals: state.goals,
      goalsWorkspaceId: state.goalsWorkspaceId,
      goalsLoadingByWs: state.goalsLoadingByWs,
      goalsLoadedByWs: state.goalsLoadedByWs,
      selectedCategoryId: state.selectedCategoryId,
      sessionTitle: state.sessionTitle,
      sessionDescription: state.sessionDescription,
      sessionTaskId: state.sessionTaskId,
      sessionTaskName: state.sessionTaskName,
      sessionTaskTicketLabel: state.sessionTaskTicketLabel,
    );
  }

  Future<void> _persistCurrentStateToCache() async {
    final wsId = _activeWorkspaceId;
    final userId = _activeUserId;
    if (wsId == null || userId == null || wsId.isEmpty || userId.isEmpty) {
      return;
    }

    await CacheStore.instance.write(
      key: _cacheKey(wsId, userId),
      policy: _cachePolicy,
      payload: _stateToCachePayload(state),
      tags: [_cacheTag, 'workspace:$wsId', 'module:timer'],
    );
  }

  void prepareForWorkspaceSwitch() {
    _stopTick();
    emit(
      state.copyWith(
        status: TimeTrackerStatus.initial,
        isFromCache: false,
        isRefreshing: false,
        lastUpdatedAt: null,
        clearRunningSession: true,
        clearActiveBreak: true,
        clearRunningSessionTask: true,
        elapsed: Duration.zero,
        recentSessions: const [],
        categories: const [],
        stats: null,
        historySessions: const [],
        historyHasMore: false,
        clearHistoryNextCursor: true,
        clearHistoryPeriodStats: true,
        isHistoryLoading: false,
        isHistoryLoadingMore: false,
        clearGoals: true,
        clearGoalsLoaded: true,
        goalsWorkspaceId: null,
        goalsLoadingByWs: const {},
        goalsLoadedByWs: const {},
        clearError: true,
      ),
    );
  }

  Future<void> loadData(
    String wsId,
    String userId, {
    int? firstDayOfWeek,
    bool forceRefresh = false,
    bool throwOnError = false,
  }) async {
    final effectiveFirstDayOfWeek = firstDayOfWeek ?? _historyFirstDayOfWeek;
    _historyFirstDayOfWeek = effectiveFirstDayOfWeek;
    _activeWorkspaceId = wsId;
    _activeUserId = userId;
    final loadDataRequestToken = ++_loadDataRequestToken;
    _goalsWorkspaceRequestToken++;
    _goalsRequestVersionByWs.clear();
    final cached = _cachedStateFor(wsId: wsId, userId: userId);
    final cachedRead = await CacheStore.instance.read<Map<String, dynamic>>(
      key: _cacheKey(wsId, userId),
      decode: _decodeCacheJson,
    );

    if (cached != null) {
      emit(
        cached.copyWith(
          status: TimeTrackerStatus.loaded,
          isFromCache: true,
          isRefreshing: forceRefresh || !cachedRead.isFresh,
          lastUpdatedAt: cachedRead.fetchedAt,
          clearError: true,
        ),
      );
      if (!forceRefresh && cachedRead.isFresh) {
        if (cached.runningSession != null && !cached.isPaused) {
          _startTick();
        }
        return;
      }
    } else {
      emit(
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
      final anchorDate = state.historyAnchorDate ?? DateTime.now();
      final timezone = await getCurrentTimezoneIdentifier();
      final periodRange = _historyPeriodRange(
        state.historyViewMode,
        anchorDate,
        firstDayOfWeek: effectiveFirstDayOfWeek,
      );
      final normalizedUserId = _normalizeUserId(userId);
      final runningSessionFuture = _repo.getRunningSession(wsId);
      final categoriesFuture = _repo.getCategories(wsId);
      final recentSessionsFuture = _repo.getSessions(wsId, limit: 5);
      final statsFuture = _repo.getStats(
        wsId,
        userId,
        timezone: timezone,
      );
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

      final runningSession = await runningSessionFuture;
      final categories = await categoriesFuture;
      final recentSessions = await recentSessionsFuture;
      final stats = await statsFuture;
      final historyPage = await historyPageFuture;
      final historyPeriodStats = await historyPeriodStatsFuture;
      final pomodoroSettings = await pomodoroSettingsFuture;
      final workspaceSettings = await workspaceSettingsFuture;

      TimeTrackingBreak? activeBreak;
      if (runningSession != null) {
        activeBreak = await _repo.getActiveBreak(wsId, runningSession.id);
      }

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
          final isStaleTaskRequest =
              loadDataRequestToken != _loadDataRequestToken ||
              _activeWorkspaceId != wsId;
          if (isStaleTaskRequest) {
            runningTaskOption = null;
          }
        } on Exception catch (e) {
          developer.log(
            'Failed to load running session task info',
            name: 'TimeTrackerCubit',
            error: e,
          );
        }
      }

      emit(
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
      await _persistCurrentStateToCache();

      if (runningSession != null && !isPaused) {
        _startTick();
      }
    } on Exception catch (e) {
      if (cached != null) {
        emit(
          state.copyWith(
            status: TimeTrackerStatus.loaded,
            isRefreshing: false,
            error: e.toString(),
          ),
        );
        if (throwOnError) {
          rethrow;
        }
        return;
      }
      emit(
        state.copyWith(status: TimeTrackerStatus.error, error: e.toString()),
      );
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> startSession(String wsId) async {
    try {
      // Stop any existing running session first
      if (state.runningSession != null) {
        await _repo.stopSession(wsId, state.runningSession!.id);
      }

      final session = await _repo.startSession(
        wsId,
        title: state.sessionTitle ?? 'Work session',
        description: state.sessionDescription,
        categoryId: state.selectedCategoryId,
        taskId: state.sessionTaskId,
      );

      emit(
        state.copyWith(
          runningSession: session,
          elapsed: Duration.zero,
          isPaused: false,
          clearActiveBreak: true,
          // Carry the pre-start task info into the running session display.
          runningSessionTaskName: state.sessionTaskName,
          runningSessionTaskTicketLabel: state.sessionTaskTicketLabel,
          clearRunningSessionTask: state.sessionTaskId == null,
          clearError: true,
        ),
      );
      await _persistCurrentStateToCache();

      _startTick();
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  bool sessionExceedsThreshold(TimeTrackingSession session) {
    return exceedsThreshold(session.startTime, state.thresholdDays);
  }

  Future<void> stopSession(
    String wsId,
    String userId, {
    bool throwOnError = false,
  }) async {
    if (state.runningSession == null) return;

    try {
      _stopTick();

      await _repo.stopSession(wsId, state.runningSession!.id);

      emit(
        state.copyWith(
          elapsed: Duration.zero,
          isPaused: false,
          clearRunningSession: true,
          clearActiveBreak: true,
          clearRunningSessionTask: true,
          clearError: true,
        ),
      );
      await _persistCurrentStateToCache();

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          recentSessions: recentSessions,
          stats: stats,
          clearError: true,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> pauseSession() async {
    if (state.runningSession == null) return;

    try {
      _stopTick();

      final wsId = state.runningSession!.wsId;
      if (wsId == null) {
        emit(state.copyWith(error: 'Workspace ID not found'));
        return;
      }

      final session = await _repo.pauseSession(wsId, state.runningSession!.id);
      final activeBreak = await _repo.getActiveBreak(wsId, session.id);

      emit(
        state.copyWith(
          runningSession: session,
          activeBreak: activeBreak,
          isPaused: true,
        ),
      );
      await _persistCurrentStateToCache();
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<void> resumeSession({bool throwOnError = false}) async {
    if (state.runningSession == null) return;

    try {
      final wsId = state.runningSession!.wsId;
      if (wsId == null) {
        emit(state.copyWith(error: 'Workspace ID not found'));
        return;
      }

      final newSession = await _repo.resumeSession(
        wsId,
        state.runningSession!.id,
      );

      emit(
        state.copyWith(
          runningSession: newSession,
          elapsed: Duration.zero,
          isPaused: false,
          clearActiveBreak: true,
        ),
      );
      await _persistCurrentStateToCache();

      _startTick();
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  void selectCategory(String? id) {
    if (id == null) {
      emit(state.copyWith(clearSelectedCategory: true));
    } else {
      emit(state.copyWith(selectedCategoryId: id));
    }
  }

  void setTitle(String title) {
    emit(state.copyWith(sessionTitle: title));
  }

  void setDescription(String description) {
    if (description.isEmpty) {
      emit(state.copyWith(clearSessionDescription: true));
    } else {
      emit(state.copyWith(sessionDescription: description));
    }
  }

  void setTaskOption(TaskLinkOption? task) {
    if (task == null) {
      emit(state.copyWith(clearSessionTaskId: true));
    } else {
      emit(
        state.copyWith(
          sessionTaskId: task.id,
          sessionTaskName: task.name.trim().isNotEmpty
              ? task.name.trim()
              : null,
          sessionTaskTicketLabel: task.ticketLabel,
        ),
      );
    }
  }

  void setHistoryContext({
    HistoryViewMode? viewMode,
    DateTime? anchorDate,
  }) {
    final normalizedAnchorDate = anchorDate == null
        ? null
        : DateTime(anchorDate.year, anchorDate.month, anchorDate.day);
    emit(
      state.copyWith(
        historyViewMode: viewMode ?? state.historyViewMode,
        historyAnchorDate:
            normalizedAnchorDate ?? state.historyAnchorDate ?? DateTime.now(),
      ),
    );
  }

  Future<void> setHistoryViewMode(
    String wsId,
    String userId,
    HistoryViewMode viewMode, {
    int firstDayOfWeek = DateTime.monday,
  }) async {
    final previousFirstDayOfWeek = _historyFirstDayOfWeek;
    final firstDayOfWeekChanged = previousFirstDayOfWeek != firstDayOfWeek;
    _historyFirstDayOfWeek = firstDayOfWeek;
    if (state.historyViewMode == viewMode && !firstDayOfWeekChanged) return;
    if (state.historyViewMode != viewMode) {
      emit(
        state.copyWith(
          historyViewMode: viewMode,
          historyAnchorDate: state.historyAnchorDate ?? DateTime.now(),
        ),
      );
    }
    await loadHistoryInitial(
      wsId,
      userId,
      firstDayOfWeek: firstDayOfWeek,
    );
  }

  Future<void> goToPreviousPeriod(
    String wsId,
    String userId, {
    int firstDayOfWeek = DateTime.monday,
  }) async {
    _historyFirstDayOfWeek = firstDayOfWeek;
    final nextAnchor = _moveHistoryAnchor(-1);
    emit(state.copyWith(historyAnchorDate: nextAnchor));
    await loadHistoryInitial(
      wsId,
      userId,
      firstDayOfWeek: firstDayOfWeek,
    );
  }

  Future<void> goToNextPeriod(
    String wsId,
    String userId, {
    int firstDayOfWeek = DateTime.monday,
  }) async {
    _historyFirstDayOfWeek = firstDayOfWeek;
    final nextAnchor = _moveHistoryAnchor(1);
    emit(state.copyWith(historyAnchorDate: nextAnchor));
    await loadHistoryInitial(
      wsId,
      userId,
      firstDayOfWeek: firstDayOfWeek,
    );
  }

  Future<void> goToCurrentPeriod(
    String wsId,
    String userId, {
    int firstDayOfWeek = DateTime.monday,
  }) async {
    _historyFirstDayOfWeek = firstDayOfWeek;
    emit(state.copyWith(historyAnchorDate: DateTime.now()));
    await loadHistoryInitial(
      wsId,
      userId,
      firstDayOfWeek: firstDayOfWeek,
    );
  }

  Future<void> refreshHistory(
    String wsId,
    String userId, {
    int firstDayOfWeek = DateTime.monday,
  }) async {
    _historyFirstDayOfWeek = firstDayOfWeek;
    await loadHistoryInitial(
      wsId,
      userId,
      firstDayOfWeek: firstDayOfWeek,
    );
  }

  Future<void> loadHistoryInitial(
    String wsId,
    String userId, {
    bool throwOnError = false,
    int? firstDayOfWeek,
  }) async {
    final effectiveFirstDayOfWeek = firstDayOfWeek ?? _historyFirstDayOfWeek;
    _historyFirstDayOfWeek = effectiveFirstDayOfWeek;
    if (wsId.isEmpty) return;
    await _ensureHistoryPreferencesLoaded();
    final anchorDate = state.historyAnchorDate ?? DateTime.now();
    final periodRange = _historyPeriodRange(
      state.historyViewMode,
      anchorDate,
      firstDayOfWeek: effectiveFirstDayOfWeek,
    );
    final normalizedUserId = _normalizeUserId(userId);

    emit(
      state.copyWith(
        historyAnchorDate: anchorDate,
        isHistoryLoading: true,
        isHistoryLoadingMore: false,
        historyHasMore:
            state.historySessions.isNotEmpty && state.historyHasMore,
        clearHistoryNextCursor: state.historySessions.isEmpty,
        clearHistoryPeriodStats:
            state.historySessions.isEmpty && state.historyPeriodStats == null,
        clearError: true,
      ),
    );

    try {
      final timezone = await getCurrentTimezoneIdentifier();
      final (page, periodStats) = await (
        _repo.getHistorySessions(
          wsId,
          dateFrom: periodRange.start,
          dateTo: periodRange.end,
          userId: normalizedUserId,
        ),
        _repo.getPeriodStats(
          wsId,
          dateFrom: periodRange.start,
          dateTo: periodRange.end,
          userId: normalizedUserId,
          timezone: timezone,
        ),
      ).wait;

      emit(
        state.copyWith(
          historySessions: page.sessions,
          historyHasMore: page.hasMore,
          historyNextCursor: page.nextCursor,
          historyPeriodStats: periodStats,
          isHistoryLoading: false,
          isHistoryLoadingMore: false,
          clearError: true,
        ),
      );
      await _persistCurrentStateToCache();
    } on Exception catch (e) {
      emit(
        state.copyWith(
          isHistoryLoading: false,
          isHistoryLoadingMore: false,
          error: e.toString(),
        ),
      );
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> loadHistoryMore(
    String wsId,
    String userId, {
    int? firstDayOfWeek,
    bool throwOnError = false,
  }) async {
    final effectiveFirstDayOfWeek = firstDayOfWeek ?? _historyFirstDayOfWeek;
    _historyFirstDayOfWeek = effectiveFirstDayOfWeek;
    if (wsId.isEmpty ||
        !state.historyHasMore ||
        state.historyNextCursor == null ||
        state.isHistoryLoadingMore ||
        state.isHistoryLoading) {
      return;
    }

    final anchorDate = state.historyAnchorDate ?? DateTime.now();
    final periodRange = _historyPeriodRange(
      state.historyViewMode,
      anchorDate,
      firstDayOfWeek: effectiveFirstDayOfWeek,
    );
    final normalizedUserId = _normalizeUserId(userId);

    emit(state.copyWith(isHistoryLoadingMore: true, clearError: true));
    try {
      final page = await _repo.getHistorySessions(
        wsId,
        dateFrom: periodRange.start,
        dateTo: periodRange.end,
        cursor: state.historyNextCursor,
        userId: normalizedUserId,
      );
      emit(
        state.copyWith(
          historySessions: [...state.historySessions, ...page.sessions],
          historyHasMore: page.hasMore,
          historyNextCursor: page.nextCursor,
          isHistoryLoadingMore: false,
          clearError: true,
        ),
      );
      await _persistCurrentStateToCache();
    } on Exception catch (e) {
      emit(state.copyWith(isHistoryLoadingMore: false, error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> toggleHistoryStatsAccordion() async {
    final nextValue = !state.isHistoryStatsAccordionOpen;
    emit(state.copyWith(isHistoryStatsAccordionOpen: nextValue));
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_historyStatsAccordionPrefsKey, nextValue);
    } on Exception catch (error, stackTrace) {
      developer.log(
        'Failed to persist history accordion state',
        name: 'TimeTrackerCubit',
        error: error,
        stackTrace: stackTrace,
      );
    }
  }

  Future<void> editSession(
    String sessionId,
    String wsId, {
    String? userId,
    String? title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
    bool throwOnError = false,
  }) async {
    try {
      await _repo.editSession(
        wsId,
        sessionId,
        title: title,
        description: description,
        categoryId: categoryId,
        startTime: startTime,
        endTime: endTime,
      );

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);
      emit(state.copyWith(recentSessions: recentSessions, stats: stats));
      await loadHistoryInitial(wsId, userId ?? '');
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> deleteSession(
    String sessionId,
    String wsId,
    String userId, {
    bool throwOnError = false,
  }) async {
    try {
      final isDeletingRunningSession = state.runningSession?.id == sessionId;
      await _repo.deleteSession(wsId, sessionId);

      emit(
        state.copyWith(
          elapsed: isDeletingRunningSession ? Duration.zero : null,
          isPaused: isDeletingRunningSession ? false : null,
          clearRunningSession: isDeletingRunningSession,
          clearActiveBreak: isDeletingRunningSession,
          clearRunningSessionTask: isDeletingRunningSession,
          clearError: true,
        ),
      );

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          recentSessions: recentSessions,
          stats: stats,
          clearError: true,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> createMissedEntry(
    String wsId,
    String userId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
    bool throwOnError = false,
  }) async {
    try {
      await _repo.createMissedEntry(
        wsId,
        title: title,
        categoryId: categoryId,
        startTime: startTime,
        endTime: endTime,
        description: description,
      );

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          recentSessions: recentSessions,
          stats: stats,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> createMissedEntryAsRequest(
    String wsId,
    String userId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
    List<String>? imageLocalPaths,
    bool throwOnError = false,
  }) async {
    try {
      await _repo.createRequest(
        wsId,
        title: title,
        description: description,
        categoryId: categoryId,
        startTime: startTime,
        endTime: endTime,
        imageLocalPaths: imageLocalPaths,
      );

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          recentSessions: recentSessions,
          stats: stats,
          clearError: true,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> discardRunningSession(
    String wsId,
    String userId, {
    bool throwOnError = false,
  }) async {
    if (state.runningSession == null) {
      return;
    }

    try {
      _stopTick();
      await _repo.deleteSession(wsId, state.runningSession!.id);

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          elapsed: Duration.zero,
          recentSessions: recentSessions,
          stats: stats,
          isPaused: false,
          clearRunningSession: true,
          clearActiveBreak: true,
          clearRunningSessionTask: true,
          clearError: true,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
    bool throwOnError = false,
  }) async {
    try {
      final createdCategory = await _repo.createCategory(
        wsId,
        name,
        color: color,
        description: description,
      );

      final optimisticCategories = <TimeTrackingCategory>[
        createdCategory,
        ...state.categories.where(
          (category) => category.id != createdCategory.id,
        ),
      ];
      emit(state.copyWith(categories: optimisticCategories, clearError: true));

      try {
        final categories = await _repo.getCategories(wsId);
        emit(state.copyWith(categories: categories, clearError: true));
      } on Exception catch (error, stackTrace) {
        developer.log(
          'Failed to refresh categories after create',
          name: 'TimeTrackerCubit',
          error: error,
          stackTrace: stackTrace,
        );
      }
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> createGoal(
    String wsId, {
    required int dailyGoalMinutes,
    String? categoryId,
    int? weeklyGoalMinutes,
    bool isActive = true,
    bool throwOnError = false,
  }) async {
    try {
      final goal = await _repo.createGoal(
        wsId,
        categoryId: categoryId,
        dailyGoalMinutes: dailyGoalMinutes,
        weeklyGoalMinutes: weeklyGoalMinutes,
        isActive: isActive,
      );
      final existingGoals = state.goalsWorkspaceId == wsId
          ? state.goals
          : const <TimeTrackingGoal>[];
      emit(
        state.copyWith(
          goals: [goal, ...existingGoals],
          goalsWorkspaceId: wsId,
          goalsLoadedByWs: _setGoalFlag(state.goalsLoadedByWs, wsId, true),
          goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> updateGoal(
    String wsId,
    String goalId, {
    String? categoryId,
    bool includeCategoryId = false,
    bool includeWeeklyGoalMinutes = false,
    int? dailyGoalMinutes,
    int? weeklyGoalMinutes,
    bool? isActive,
    bool throwOnError = false,
  }) async {
    try {
      final goal = await _repo.updateGoal(
        wsId,
        goalId,
        categoryId: categoryId,
        includeCategoryId: includeCategoryId,
        includeWeeklyGoalMinutes: includeWeeklyGoalMinutes,
        dailyGoalMinutes: dailyGoalMinutes,
        weeklyGoalMinutes: weeklyGoalMinutes,
        isActive: isActive,
      );

      final existingGoals = state.goalsWorkspaceId == wsId
          ? state.goals
          : const <TimeTrackingGoal>[];
      final updatedGoals = existingGoals
          .map(
            (existingGoal) => existingGoal.id == goal.id ? goal : existingGoal,
          )
          .toList();
      emit(
        state.copyWith(
          goals: updatedGoals,
          goalsWorkspaceId: wsId,
          goalsLoadedByWs: _setGoalFlag(state.goalsLoadedByWs, wsId, true),
          goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> deleteGoal(
    String wsId,
    String goalId, {
    bool throwOnError = false,
  }) async {
    try {
      await _repo.deleteGoal(wsId, goalId);
      final existingGoals = state.goalsWorkspaceId == wsId
          ? state.goals
          : const <TimeTrackingGoal>[];
      emit(
        state.copyWith(
          goals: existingGoals.where((goal) => goal.id != goalId).toList(),
          goalsWorkspaceId: wsId,
          goalsLoadedByWs: _setGoalFlag(state.goalsLoadedByWs, wsId, true),
          goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> loadGoals(
    String wsId, {
    String? userId,
    bool force = false,
    bool throwOnError = false,
  }) async {
    if (wsId.isEmpty) {
      return;
    }
    if (!force &&
        (state.hasLoadedGoalsFor(wsId) || state.isGoalsLoadingFor(wsId))) {
      return;
    }

    final requestVersion = (_goalsRequestVersionByWs[wsId] ?? 0) + 1;
    _goalsRequestVersionByWs[wsId] = requestVersion;
    final workspaceRequestToken = ++_goalsWorkspaceRequestToken;
    emit(
      state.copyWith(
        goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, true),
        clearError: true,
      ),
    );
    try {
      final goals = await _repo.getGoals(wsId, userId: userId);
      final activeRequestVersion = _goalsRequestVersionByWs[wsId];
      if (activeRequestVersion != requestVersion) {
        return;
      }
      if (workspaceRequestToken != _goalsWorkspaceRequestToken) {
        emit(
          state.copyWith(
            goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          goals: goals,
          goalsWorkspaceId: wsId,
          goalsLoadedByWs: _setGoalFlag(state.goalsLoadedByWs, wsId, true),
          goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      final activeRequestVersion = _goalsRequestVersionByWs[wsId];
      if (activeRequestVersion != requestVersion) {
        return;
      }
      if (workspaceRequestToken != _goalsWorkspaceRequestToken) {
        emit(
          state.copyWith(
            goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          goalsLoadingByWs: _setGoalFlag(state.goalsLoadingByWs, wsId, false),
          error: e.toString(),
        ),
      );
      if (throwOnError) {
        rethrow;
      }
    }
  }

  Future<void> updatePomodoroSettings(PomodoroSettings settings) async {
    await _repo.savePomodoroSettings(settings);
    emit(state.copyWith(pomodoroSettings: settings));
  }

  void togglePomodoro() {
    if (state.pomodoroPhase == PomodoroPhase.idle) {
      emit(
        state.copyWith(
          pomodoroPhase: PomodoroPhase.focus,
          pomodoroSessionCount: 0,
        ),
      );
    } else {
      emit(
        state.copyWith(
          pomodoroPhase: PomodoroPhase.idle,
          pomodoroSessionCount: 0,
        ),
      );
    }
  }

  void skipPomodoroPhase() {
    final nextPhase = switch (state.pomodoroPhase) {
      PomodoroPhase.focus => _nextBreakPhase(),
      PomodoroPhase.shortBreak => PomodoroPhase.focus,
      PomodoroPhase.longBreak => PomodoroPhase.focus,
      PomodoroPhase.idle => PomodoroPhase.idle,
    };

    final count = state.pomodoroPhase == PomodoroPhase.focus
        ? state.pomodoroSessionCount + 1
        : state.pomodoroSessionCount;

    emit(
      state.copyWith(
        pomodoroPhase: nextPhase,
        pomodoroSessionCount: count,
      ),
    );
  }

  PomodoroPhase _nextBreakPhase() {
    final nextCount = state.pomodoroSessionCount + 1;
    if (nextCount >= state.pomodoroSettings.sessionsUntilLongBreak) {
      return PomodoroPhase.longBreak;
    }
    return PomodoroPhase.shortBreak;
  }

  void _startTick() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (state.runningSession?.startTime != null) {
        emit(
          state.copyWith(
            elapsed: DateTime.now().difference(
              state.runningSession!.startTime!,
            ),
          ),
        );
      }
    });
  }

  void _stopTick() {
    _ticker?.cancel();
    _ticker = null;
  }

  Future<WorkspaceSettings?> _safeGetWorkspaceSettings(String wsId) async {
    try {
      return await _repo.getWorkspaceSettings(wsId);
    } on Exception catch (error, stackTrace) {
      developer.log(
        'Failed to load workspace settings',
        name: 'TimeTrackerCubit',
        error: error,
        stackTrace: stackTrace,
      );
      developer.log('Workspace settings load failed for wsId=$wsId');
      return null;
    }
  }

  Future<void> _ensureHistoryPreferencesLoaded() async {
    final existingLoadFuture = _historyPreferencesLoadFuture;
    if (existingLoadFuture != null) {
      await existingLoadFuture;
      return;
    }

    final loadFuture = () async {
      try {
        final prefs = await SharedPreferences.getInstance();
        final isOpen = prefs.getBool(_historyStatsAccordionPrefsKey) ?? false;
        if (isOpen != state.isHistoryStatsAccordionOpen) {
          emit(state.copyWith(isHistoryStatsAccordionOpen: isOpen));
        }
      } on Exception catch (error, stackTrace) {
        developer.log(
          'Failed to load history accordion preference',
          name: 'TimeTrackerCubit',
          error: error,
          stackTrace: stackTrace,
        );
      }
    }();

    _historyPreferencesLoadFuture = loadFuture;
    try {
      await loadFuture;
    } finally {
      if (identical(_historyPreferencesLoadFuture, loadFuture)) {
        _historyPreferencesLoadFuture = null;
      }
    }
  }

  DateTime _moveHistoryAnchor(int delta) {
    final current = state.historyAnchorDate ?? DateTime.now();
    return switch (state.historyViewMode) {
      HistoryViewMode.day => current.add(Duration(days: delta)),
      HistoryViewMode.week => current.add(Duration(days: delta * 7)),
      HistoryViewMode.month => () {
        final normalizedMonth = DateTime(
          current.year,
          current.month + delta,
          1,
          current.hour,
          current.minute,
          current.second,
          current.millisecond,
          current.microsecond,
        );
        final targetMonthLastDay = DateTime(
          normalizedMonth.year,
          normalizedMonth.month + 1,
          0,
        ).day;
        final clampedDay = current.day > targetMonthLastDay
            ? targetMonthLastDay
            : current.day;
        return DateTime(
          normalizedMonth.year,
          normalizedMonth.month,
          clampedDay,
          current.hour,
          current.minute,
          current.second,
          current.millisecond,
          current.microsecond,
        );
      }(),
    };
  }

  ({DateTime start, DateTime end}) _historyPeriodRange(
    HistoryViewMode mode,
    DateTime anchor, {
    int firstDayOfWeek = DateTime.monday,
  }) {
    final localAnchor = anchor.toLocal();
    switch (mode) {
      case HistoryViewMode.day:
        final start = DateTime(
          localAnchor.year,
          localAnchor.month,
          localAnchor.day,
        );
        final end = start
            .add(const Duration(days: 1))
            .subtract(
              const Duration(microseconds: 1),
            );
        return (start: start, end: end);
      case HistoryViewMode.week:
        final normalizedAnchor = DateTime(
          localAnchor.year,
          localAnchor.month,
          localAnchor.day,
        );
        final offset = (normalizedAnchor.weekday - firstDayOfWeek + 7) % 7;
        final start = normalizedAnchor.subtract(Duration(days: offset));
        final end = start
            .add(const Duration(days: 7))
            .subtract(const Duration(microseconds: 1));
        return (start: start, end: end);
      case HistoryViewMode.month:
        final start = DateTime(localAnchor.year, localAnchor.month);
        final end = DateTime(localAnchor.year, localAnchor.month + 1).subtract(
          const Duration(microseconds: 1),
        );
        return (start: start, end: end);
    }
  }

  String? _normalizeUserId(String? userId) {
    if (userId == null || userId.isEmpty) return null;
    return userId;
  }

  Future<(List<TimeTrackingSession>, TimeTrackerStats)> _loadRecentAndSummary(
    String wsId,
    String? userId,
  ) async {
    final timezone = await getCurrentTimezoneIdentifier();
    final (recentSessions, stats) = await (
      _repo.getSessions(wsId, limit: 5),
      _repo.getStats(wsId, userId, timezone: timezone),
    ).wait;
    return (recentSessions, stats);
  }

  @override
  Future<void> close() {
    _stopTick();
    return super.close();
  }
}
