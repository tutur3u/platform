import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
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
  late final PomodoroSessions _sessions = PomodoroSessions(_repository);
  Timer? _phaseTimer;
  Future<void>? _inFlight;
  ({String? userId, Future<void> run})? _restoring;

  /// A phase that ended more than this long ago ended unattended (the app
  /// was asleep or closed). Focus never auto-starts after such an end.
  static const onTime = Duration(minutes: 1);

  /// The controller's clock, so views count down against the same time.
  DateTime now() => _now();

  /// Runs [action] once every earlier restore, reconcile, phase end and
  /// user action has finished, so none of them interleave. No future is
  /// kept between calls, so callers in any zone can wait on it.
  Future<void> _exclusive(Future<void> Function() action) async {
    for (var running = _inFlight; running != null; running = _inFlight) {
      try {
        await running;
      } on Object {
        // The earlier action reports its own failure.
      }
    }
    final done = Completer<void>();
    _inFlight = done.future;
    try {
      await action();
    } finally {
      _inFlight = null;
      done.complete();
    }
  }

  /// Restores the stored Pomodoro for [userId], then reconciles it. Another
  /// account's Pomodoro is discarded, because its session cannot be closed
  /// from here. A restore already in flight for the same user is reused.
  Future<void> restore(String? userId) {
    final inFlight = _restoring;
    if (inFlight != null && inFlight.userId == userId) return inFlight.run;
    final run = _exclusive(() => _restore(userId));
    final entry = (userId: userId, run: run);
    _restoring = entry;
    return run.whenComplete(() {
      if (identical(_restoring, entry)) _restoring = null;
    });
  }

  Future<void> _restore(String? userId) async {
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
    await _reconcile();
  }

  /// Ends every phase whose deadline has passed, as when the app resumes or
  /// the phase timer fires late. Safe to call at any time.
  Future<void> reconcile() => _exclusive(_reconcile);

  Future<void> _reconcile() async {
    while (!isClosed && state.isRunning && !state.deadline!.isAfter(_now())) {
      await _completePhase();
    }
    _armTimer();
  }

  /// Starts a focus phase with a new tracking session. When [replacingPaused]
  /// is given (a confirmed replacement), that paused session is stopped
  /// first, closing its break, and put back if the new start fails.
  Future<void> startFocus({
    required String userId,
    required String wsId,
    required String title,
    String? taskId,
    String? taskName,
    TimeTrackingSession? replacingPaused,
  }) async {
    if (replacingPaused != null) {
      await _repository.stopSession(wsId, replacingPaused.id);
    }
    final TimeTrackingSession session;
    try {
      session = await _repository.startSession(
        wsId,
        title: title,
        taskId: taskId,
      );
    } on Exception {
      if (replacingPaused != null) {
        await _restorePaused(wsId, replacingPaused);
      }
      rethrow;
    }
    await adoptFocus(
      userId: userId,
      wsId: wsId,
      sessionId: session.id,
      title: title,
      taskId: taskId,
      taskName: taskName,
    );
  }

  /// Puts a stopped paused session back: resumed, then paused again.
  Future<void> _restorePaused(String wsId, TimeTrackingSession paused) async {
    try {
      final resumed = await _repository.resumeSession(wsId, paused.id);
      await _repository.pauseSession(wsId, resumed.id);
    } on Exception {
      // The Timer shows what is left; the start error is reported.
    }
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
    await _exclusive(
      () => _set(
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
      ),
    );
  }

  /// The tracker's running and paused sessions, so a caller can confirm
  /// before a focus start replaces them.
  Future<({TimeTrackingSession? running, TimeTrackingSession? paused})>
  currentTracking(String wsId) async {
    final running = await _repository.getRunningSession(wsId);
    final paused = running == null
        ? await _repository.getPausedSession(wsId)
        : null;
    return (running: running, paused: paused);
  }

  /// Holds the countdown. A focus phase also pauses its current session
  /// (re-read, since the main Timer may have resumed it under a new id).
  Future<void> pause() => _exclusive(() async {
    if (!state.isRunning) return;
    var sessionId = state.sessionId;
    if (state.isFocus) {
      final found = await _sessions.current(state);
      sessionId = found.session?.id ?? sessionId;
      if (found.status == FocusSessionStatus.running) {
        await _repository.pauseSession(state.wsId!, found.session!.id);
      }
    }
    await _set(
      state.copyWith(
        deadline: () => null,
        remaining: state.remainingAt(_now()),
        sessionId: () => sessionId,
      ),
    );
  });

  /// Continues a paused or waiting phase. A focus phase adopts a session
  /// already running for it, resumes its paused session, or starts one.
  Future<void> resume() => _exclusive(() async {
    if (!state.isPaused) return;
    String? sessionId;
    if (state.isFocus) {
      final wsId = state.wsId!;
      final found = await _sessions.current(state);
      sessionId = switch (found.status) {
        FocusSessionStatus.running => found.session!.id,
        FocusSessionStatus.paused => (await _repository.resumeSession(
          wsId,
          found.session!.id,
        )).id,
        _ => (await _repository.startSession(
          wsId,
          title: state.title,
          taskId: state.taskId,
        )).id,
      };
    }
    await _set(
      state.copyWith(
        deadline: () => _now().add(state.remaining),
        sessionId: () => sessionId,
      ),
    );
  });

  /// Ends the current phase now and moves to the next one.
  Future<void> skip() => _exclusive(() async {
    if (state.isIdle) return;
    await _completePhase();
    _armTimer();
  });

  /// Ends the Pomodoro. The device state is cleared first, so a session
  /// already stopped elsewhere can never leave the Pomodoro stuck; then the
  /// phase's current session is stopped (already stopped counts as done).
  Future<void> stop() => _exclusive(() async {
    final ended = state;
    _phaseTimer?.cancel();
    await _set(const PomodoroState());
    if (ended.isFocus) await _sessions.stop(ended);
  });

  /// Ends the current phase. A phase that ended unattended (more than
  /// [onTime] ago) never auto-starts focus, and a focus session that starts
  /// counts its deadline from its real start.
  Future<void> _completePhase() async {
    final settings = await _loadSettings();
    final ended = state;
    final now = _now();
    final deadline = ended.deadline;
    final late = deadline != null && now.difference(deadline) > onTime;
    if (ended.isFocus) {
      await _closeFocus(ended, late: late);
      final completed = ended.completedFocus + 1;
      final long = completed % settings.sessionsUntilLongBreak == 0;
      final length = Duration(
        minutes: long ? settings.longBreakMinutes : settings.shortBreakMinutes,
      );
      // Breaks track nothing, so a missed break may still be replayed from
      // the focus deadline; the next focus then waits.
      await _set(
        ended.copyWith(
          phase: long ? PomodoroPhase.longBreak : PomodoroPhase.shortBreak,
          completedFocus: completed,
          remaining: length,
          deadline: () => settings.autoStartBreaks
              ? (late ? deadline : now).add(length)
              : null,
          sessionId: () => null,
        ),
        arm: false,
      );
      return;
    }
    final length = Duration(minutes: settings.focusMinutes);
    String? sessionId;
    if (settings.autoStartFocus && !late) {
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
        deadline: () => sessionId == null ? null : _now().add(length),
        sessionId: () => sessionId,
      ),
      arm: false,
    );
  }

  /// Stops the focus phase's real current session. A late stop is trimmed
  /// back to the deadline when that is after the session's start.
  Future<void> _closeFocus(PomodoroState ended, {required bool late}) async {
    final TimeTrackingSession? stopped;
    try {
      stopped = await _sessions.stop(ended);
    } on Exception {
      // The Timer page shows the session; it can be stopped there.
      return;
    }
    final deadline = ended.deadline;
    if (late && stopped != null && deadline != null) {
      await _sessions.trimTo(ended, stopped, deadline);
    }
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
    if (isClosed || !state.isRunning || deadline == null) return;
    final wait = deadline.difference(_now());
    _phaseTimer = Timer(wait.isNegative ? Duration.zero : wait, () {
      if (!isClosed) unawaited(reconcile());
    });
  }

  @override
  Future<void> close() {
    _phaseTimer?.cancel();
    return super.close();
  }
}
