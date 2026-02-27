import 'dart:async';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/threshold.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TimeTrackerCubit extends Cubit<TimeTrackerState> {
  TimeTrackerCubit({required ITimeTrackerRepository repository})
    : _repo = repository,
      super(const TimeTrackerState());

  final ITimeTrackerRepository _repo;
  Timer? _ticker;
  static const _historyStatsAccordionPrefsKey =
      'time_tracker_history_stats_open';
  Future<void>? _historyPreferencesLoadFuture;
  int _historyFirstDayOfWeek = DateTime.monday;

  Future<void> loadData(
    String wsId,
    String userId, {
    int? firstDayOfWeek,
    bool throwOnError = false,
  }) async {
    final effectiveFirstDayOfWeek = firstDayOfWeek ?? _historyFirstDayOfWeek;
    _historyFirstDayOfWeek = effectiveFirstDayOfWeek;
    emit(state.copyWith(status: TimeTrackerStatus.loading, clearError: true));

    try {
      await _ensureHistoryPreferencesLoaded();
      final anchorDate = state.historyAnchorDate ?? DateTime.now();
      final periodRange = _historyPeriodRange(
        state.historyViewMode,
        anchorDate,
        firstDayOfWeek: effectiveFirstDayOfWeek,
      );
      final normalizedUserId = _normalizeUserId(userId);
      final runningSessionFuture = _repo.getRunningSession(wsId);
      final categoriesFuture = _repo.getCategories(wsId);
      final recentSessionsFuture = _repo.getSessions(wsId, limit: 5);
      final statsFuture = _repo.getStats(wsId, userId);
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
      final elapsed = runningSession?.startTime != null && !isPaused
          ? DateTime.now().difference(runningSession!.startTime!)
          : Duration.zero;

      emit(
        state.copyWith(
          status: TimeTrackerStatus.loaded,
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
          stats: stats,
          pomodoroSettings: pomodoroSettings,
          thresholdDays: workspaceSettings?.missedEntryDateThreshold,
          isPaused: isPaused,
          clearRunningSession: runningSession == null,
          clearActiveBreak: activeBreak == null,
          clearError: true,
        ),
      );

      if (runningSession != null && !isPaused) {
        _startTick();
      }
    } on Exception catch (e) {
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
        categoryId: state.selectedCategoryId,
      );

      emit(
        state.copyWith(
          runningSession: session,
          elapsed: Duration.zero,
          isPaused: false,
          clearActiveBreak: true,
          clearError: true,
        ),
      );

      _startTick();
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  bool sessionExceedsThreshold(TimeTrackingSession session) {
    return exceedsThreshold(session.startTime, state.thresholdDays);
  }

  Future<void> stopSession(String wsId, String userId) async {
    if (state.runningSession == null) return;

    try {
      _stopTick();

      await _repo.stopSession(wsId, state.runningSession!.id);

      final (recentSessions, stats) = await _loadRecentAndSummary(wsId, userId);

      emit(
        state.copyWith(
          elapsed: Duration.zero,
          recentSessions: recentSessions,
          stats: stats,
          isPaused: false,
          clearRunningSession: true,
          clearActiveBreak: true,
          clearError: true,
        ),
      );
      await loadHistoryInitial(wsId, userId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
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
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<void> resumeSession() async {
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

      _startTick();
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
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
        historySessions: const [],
        historyHasMore: false,
        clearHistoryNextCursor: true,
        clearHistoryPeriodStats: true,
        clearError: true,
      ),
    );

    try {
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
      await _repo.deleteSession(wsId, sessionId);

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
  }) async {
    try {
      await _repo.createCategory(wsId, name, color: color);
      final categories = await _repo.getCategories(wsId);
      emit(state.copyWith(categories: categories));
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
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
    final (recentSessions, stats) = await (
      _repo.getSessions(wsId, limit: 5),
      _repo.getStats(wsId, userId),
    ).wait;
    return (recentSessions, stats);
  }

  @override
  Future<void> close() {
    _stopTick();
    return super.close();
  }
}
