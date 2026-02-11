import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';

class TimeTrackerCubit extends Cubit<TimeTrackerState> {
  TimeTrackerCubit({required TimeTrackerRepository repository})
    : _repo = repository,
      super(const TimeTrackerState());

  final TimeTrackerRepository _repo;
  Timer? _ticker;

  Future<void> loadData(String wsId, String userId) async {
    emit(state.copyWith(status: TimeTrackerStatus.loading, clearError: true));

    try {
      final results = await Future.wait([
        _repo.getRunningSession(wsId),
        _repo.getCategories(wsId),
        _repo.getSessions(wsId, limit: 5),
        _repo.getStats(wsId, userId),
        _repo.loadPomodoroSettings(),
      ]);

      final runningSession = results[0] as TimeTrackingSession?;
      final categories = results[1]! as List<TimeTrackingCategory>;
      final recentSessions = results[2]! as List<TimeTrackingSession>;
      final stats = results[3]! as TimeTrackerStats;
      final pomodoroSettings = results[4]! as PomodoroSettings;

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
          categories: categories,
          stats: stats,
          pomodoroSettings: pomodoroSettings,
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

  Future<void> stopSession(String wsId, String userId) async {
    if (state.runningSession == null) return;

    try {
      _stopTick();

      await _repo.stopSession(wsId, state.runningSession!.id);

      // Refresh data
      final results = await Future.wait([
        _repo.getSessions(wsId, limit: 5),
        _repo.getStats(wsId, userId),
      ]);

      emit(
        state.copyWith(
          elapsed: Duration.zero,
          recentSessions: results[0] as List<TimeTrackingSession>,
          stats: results[1] as TimeTrackerStats,
          isPaused: false,
          clearRunningSession: true,
          clearActiveBreak: true,
          clearError: true,
        ),
      );
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

  Future<void> editSession(
    String sessionId,
    String wsId, {
    String? title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
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

      final sessions = await _repo.getSessions(wsId, limit: 5);
      emit(state.copyWith(recentSessions: sessions));
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<void> deleteSession(
    String sessionId,
    String wsId,
    String userId,
  ) async {
    try {
      await _repo.deleteSession(wsId, sessionId);

      final results = await Future.wait([
        _repo.getSessions(wsId, limit: 5),
        _repo.getStats(wsId, userId),
      ]);

      emit(
        state.copyWith(
          recentSessions: results[0] as List<TimeTrackingSession>,
          stats: results[1] as TimeTrackerStats,
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
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

      final results = await Future.wait([
        _repo.getSessions(wsId, limit: 5),
        _repo.getStats(wsId, userId),
      ]);

      emit(
        state.copyWith(
          recentSessions: results[0] as List<TimeTrackingSession>,
          stats: results[1] as TimeTrackerStats,
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
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

  @override
  Future<void> close() {
    _stopTick();
    return super.close();
  }
}
