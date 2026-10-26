import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_store.dart';

/// Localized notification copy for the phase that just ended.
typedef PomodoroNotificationCopy =
    ({String title, String body}) Function(PomodoroPhase endingPhase);

/// Runs the device's Pomodoro.
///
/// Focus phases start and stop ordinary time-tracking sessions through the
/// existing tracker API, linked to a task when one is given. Breaks are not
/// tracked. The countdown, phase deadline and notification live on this
/// device only (no server deadline, so no migration); see the native pass
/// plan for the shared, cross-device version.
class PomodoroController extends Cubit<PomodoroState> {
  PomodoroController({
    required ITimeTrackerRepository repository,
    required Future<PomodoroSettings> Function() loadSettings,
    required PomodoroNotificationCopy notificationCopy,
    PomodoroNotifier notifier = const LocalPomodoroNotifier(),
    PomodoroStore store = const PomodoroStore(),
    DateTime Function()? now,
  }) : _repository = repository,
       _loadSettings = loadSettings,
       _copy = notificationCopy,
       _notifier = notifier,
       _store = store,
       _now = now ?? DateTime.now,
       super(const PomodoroState());

  final ITimeTrackerRepository _repository;
  final Future<PomodoroSettings> Function() _loadSettings;
  final PomodoroNotificationCopy _copy;
  final PomodoroNotifier _notifier;
  final PomodoroStore _store;
  final DateTime Function() _now;
  Timer? _phaseTimer;

  /// The controller's clock, so views count down against the same time.
  DateTime now() => _now();

  /// Restores the stored Pomodoro for [userId], ending any phases whose
  /// deadline passed while the app was closed. Another account's Pomodoro
  /// is discarded, because its session cannot be closed from here.
  Future<void> restore(String? userId) async {
    final stored = await _store.read();
    if (isClosed) return;
    _phaseTimer?.cancel();
    if (stored == null || userId == null || stored.userId != userId) {
      if (stored != null) {
        await _notifier.cancel();
        await _store.write(const PomodoroState());
      }
      if (!isClosed) emit(const PomodoroState());
      return;
    }
    emit(stored);
    while (state.isRunning && !state.deadline!.isAfter(_now())) {
      await _completePhase(catchingUp: true);
    }
    _armTimer();
  }

  /// Starts a focus phase with a new tracking session.
  Future<void> startFocus({
    required String userId,
    required String wsId,
    required String title,
    String? taskId,
    String? taskName,
  }) async {
    final session = await _repository.startSession(
      wsId,
      title: title,
      taskId: taskId,
    );
    await adoptFocus(
      userId: userId,
      wsId: wsId,
      sessionId: session.id,
      title: title,
      taskId: taskId,
      taskName: taskName,
    );
  }

  /// Starts a focus countdown for a tracking session that already runs, as
  /// Start focus on a task row does.
  Future<void> adoptFocus({
    required String userId,
    required String wsId,
    required String sessionId,
    required String title,
    String? taskId,
    String? taskName,
  }) async {
    final settings = await _loadSettings();
    final length = Duration(minutes: settings.focusMinutes);
    await _set(
      PomodoroState(
        phase: PomodoroPhase.focus,
        deadline: _now().add(length),
        remaining: length,
        userId: userId,
        wsId: wsId,
        sessionId: sessionId,
        taskId: taskId,
        taskName: taskName,
        title: title,
      ),
    );
  }

  /// Holds the countdown. A focus phase also pauses its tracking session.
  Future<void> pause() async {
    if (!state.isRunning) return;
    final paused = state.copyWith(
      deadline: () => null,
      remaining: state.remainingAt(_now()),
    );
    final sessionId = state.sessionId;
    if (state.isFocus && sessionId != null) {
      await _repository.pauseSession(state.wsId!, sessionId);
    }
    await _set(paused);
  }

  /// Continues a paused or waiting phase. A focus phase resumes its session,
  /// or starts one when the phase is waiting after a break.
  Future<void> resume() async {
    if (!state.isPaused) return;
    var sessionId = state.sessionId;
    if (state.isFocus) {
      final wsId = state.wsId!;
      sessionId = sessionId == null
          ? (await _repository.startSession(
              wsId,
              title: state.title,
              taskId: state.taskId,
            )).id
          : (await _repository.resumeSession(wsId, sessionId)).id;
    }
    await _set(
      state.copyWith(
        deadline: () => _now().add(state.remaining),
        sessionId: () => sessionId,
      ),
    );
  }

  /// Ends the current phase now and moves to the next one.
  Future<void> skip() async {
    if (state.isIdle) return;
    await _completePhase();
    _armTimer();
  }

  /// Ends the Pomodoro, closing a focus phase's session.
  Future<void> stop() async {
    final sessionId = state.sessionId;
    if (state.isFocus && sessionId != null) {
      await _repository.stopSession(state.wsId!, sessionId);
    }
    await _set(const PomodoroState());
  }

  /// Ends the current phase. While [catchingUp] on phases that ended with
  /// the app closed, focus never auto-starts, so no session is created for
  /// time nobody was there for.
  Future<void> _completePhase({bool catchingUp = false}) async {
    final settings = await _loadSettings();
    final ended = state;
    if (ended.isFocus) {
      final sessionId = ended.sessionId;
      if (sessionId != null) await _closeFocusSession(ended, sessionId);
      final completed = ended.completedFocus + 1;
      final long = completed % settings.sessionsUntilLongBreak == 0;
      final length = Duration(
        minutes: long ? settings.longBreakMinutes : settings.shortBreakMinutes,
      );
      await _set(
        ended.copyWith(
          phase: long ? PomodoroPhase.longBreak : PomodoroPhase.shortBreak,
          completedFocus: completed,
          remaining: length,
          deadline: () => settings.autoStartBreaks
              ? _phaseStart(ended).add(length)
              : null,
          sessionId: () => null,
        ),
        arm: false,
      );
      return;
    }
    final length = Duration(minutes: settings.focusMinutes);
    String? sessionId;
    if (settings.autoStartFocus && !catchingUp) {
      try {
        sessionId = (await _repository.startSession(
          ended.wsId!,
          title: ended.title,
          taskId: ended.taskId,
        )).id;
      } on Exception {
        sessionId = null;
      }
    }
    await _set(
      ended.copyWith(
        phase: PomodoroPhase.focus,
        remaining: length,
        deadline: () =>
            sessionId == null ? null : _phaseStart(ended).add(length),
        sessionId: () => sessionId,
      ),
      arm: false,
    );
  }

  /// Stops the focus session. A stop that comes well after the deadline (the
  /// app was closed) is trimmed back to the deadline when the workspace's
  /// edit rules allow it, so Focus Time is not overcounted.
  Future<void> _closeFocusSession(PomodoroState ended, String sessionId) async {
    final wsId = ended.wsId!;
    try {
      await _repository.stopSession(wsId, sessionId);
    } on Exception {
      // The Timer page shows the session; it can be stopped there.
      return;
    }
    final deadline = ended.deadline;
    if (deadline == null ||
        _now().difference(deadline) < const Duration(minutes: 1)) {
      return;
    }
    try {
      await _repository.editSession(wsId, sessionId, endTime: deadline);
    } on Exception {
      // Over the workspace's edit threshold; the stop time stands.
    }
  }

  /// When the next phase starts: the ended phase's deadline if it passed
  /// unattended, otherwise now (a skip).
  DateTime _phaseStart(PomodoroState ended) {
    final now = _now();
    final deadline = ended.deadline;
    return deadline != null && deadline.isBefore(now) ? deadline : now;
  }

  Future<void> _set(PomodoroState next, {bool arm = true}) async {
    if (isClosed) return;
    emit(next);
    await _store.write(next);
    await _notifier.cancel();
    final deadline = next.deadline;
    if (next.isRunning && deadline != null && deadline.isAfter(_now())) {
      final copy = _copy(next.phase);
      await _notifier.schedule(
        at: deadline,
        title: copy.title,
        body: copy.body,
        wsId: next.wsId,
        userId: next.userId,
      );
    }
    if (arm) _armTimer();
  }

  void _armTimer() {
    _phaseTimer?.cancel();
    final deadline = state.deadline;
    if (!state.isRunning || deadline == null) return;
    _phaseTimer = Timer(deadline.difference(_now()), () async {
      if (isClosed || !state.isRunning) return;
      await _completePhase();
      _armTimer();
    });
  }

  @override
  Future<void> close() {
    _phaseTimer?.cancel();
    return super.close();
  }
}
