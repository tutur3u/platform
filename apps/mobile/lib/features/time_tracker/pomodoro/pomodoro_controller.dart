import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_remote.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_store.dart';

part 'pomodoro_controller_shared.dart';

/// Localized notification copy for the phase that just ended.
typedef PomodoroNotificationCopy =
    ({String title, String body}) Function(PomodoroPhase endingPhase);

/// Runs the Pomodoro.
///
/// With a [PomodoroRemote] and a server that has it, the Pomodoro is shared
/// across devices: the server plans each phase and owns the focus sessions,
/// and this device mirrors it (see `pomodoro_controller_shared.dart`).
/// Otherwise it runs on this device: focus phases start and stop ordinary
/// time-tracking sessions through the tracker API, and the countdown,
/// deadline and notification live here. A device Pomodoro already running
/// finishes on the device. Breaks are never tracked.
class PomodoroController extends Cubit<PomodoroState> {
  PomodoroController({
    required ITimeTrackerRepository repository,
    required Future<PomodoroSettings> Function() loadSettings,
    required PomodoroNotificationCopy notificationCopy,
    PomodoroNotifier notifier = const LocalPomodoroNotifier(),
    PomodoroStore store = const PomodoroStore(),
    PomodoroRemote? remote,
    DateTime Function()? now,
  }) : _repository = repository,
       _remote = remote,
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
  final PomodoroRemote? _remote;
  final DateTime Function() _now;
  Future<void> Function()? _unsubscribe;
  ({String userId, String wsId})? _attached;

  /// Whether this device mirrors the server's Pomodoro rather than its own.
  bool get _mirrors => state.isShared || (state.isIdle && _attached != null);
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
    if (_attached?.userId != userId) _detach();
    if (stored == null || userId == null || stored.userId != userId) {
      if (stored != null) {
        await _notifier.cancel();
        await _store.write(const PomodoroState());
      }
      if (!isClosed) emit(const PomodoroState());
      return;
    }
    emit(stored);
    await (stored.isShared ? _reconcileShared() : _reconcile());
  }

  /// Follows the shared Pomodoro of [wsId] for [userId], unless a device
  /// Pomodoro is running here.
  Future<void> attach({required String userId, required String wsId}) =>
      _exclusive(() => _attach(userId, wsId));

  /// Ends every phase whose deadline has passed, as when the app resumes or
  /// the phase timer fires late. Safe to call at any time.
  Future<void> reconcile() =>
      _exclusive(() => _mirrors ? _reconcileShared() : _reconcile());

  Future<void> _reconcile() async {
    await _follow();
    while (!isClosed && state.isRunning && !state.deadline!.isAfter(_now())) {
      await _completePhase();
    }
    _armTimer();
  }

  /// Starts a focus phase with a new tracking session. When [replacingPaused]
  /// is given (a confirmed replacement), that paused session is stopped
  /// first, closing its break, and put back if the new start fails.
  ///
  /// The whole flow holds the lock, so no phase end interleaves, and the
  /// settings load before any session changes, so a failure never leaves an
  /// orphan running session.
  Future<void> startFocus({
    required String userId,
    required String wsId,
    required String title,
    String? taskId,
    String? taskName,
    TimeTrackingSession? replacingPaused,
  }) => _exclusive(() async {
    if (_remote != null && (state.isIdle || state.isShared)) {
      try {
        return await _startShared(
          userId: userId,
          wsId: wsId,
          title: title,
          taskId: taskId,
          taskName: taskName,
          replacingPaused: replacingPaused,
        );
      } on PomodoroRemoteUnavailable {
        // An older server: run the Pomodoro on this device.
      }
    }
    final settings = await _loadSettings();
    final before = state;
    if (replacingPaused != null) {
      await _repository.stopSession(wsId, replacingPaused.id);
    }
    final TimeTrackingSession session;
    try {
      session = await _repository.startSession(
        wsId,
        title: title,
        taskId: taskId,
        tags: const [pomodoroSessionTag],
      );
    } on Exception {
      if (replacingPaused != null) {
        await _restorePaused(wsId, replacingPaused);
      }
      rethrow;
    }
    try {
      await _adopt(
        settings,
        userId: userId,
        wsId: wsId,
        sessionId: session.id,
        title: title,
        taskId: taskId,
        taskName: taskName,
      );
    } on Exception catch (original) {
      // Leave nothing half-started: end the new session and put the
      // replaced one back. A new session that cannot be stopped is reported,
      // never swallowed; a failed restore keeps the original error.
      var orphaned = false;
      try {
        await _repository.stopSession(wsId, session.id);
      } on Exception {
        orphaned = true;
      }
      // Put the device Pomodoro back as it was before this start.
      if (!isClosed) emit(before);
      try {
        await _store.write(before);
      } on Exception {
        // The in-memory state is right; the next save retries.
      }
      _armTimer();
      if (replacingPaused != null) {
        await _restorePaused(wsId, replacingPaused);
      }
      if (orphaned) {
        throw PomodoroOrphanedSession(sessionId: session.id, cause: original);
      }
      rethrow;
    }
  });

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
  }) => _exclusive(() async {
    // The Timer start before this switched any shared Pomodoro off, so the
    // countdown on this running session belongs to this device.
    if (state.isShared) _detach();
    final settings = await _loadSettings();
    await _adopt(
      settings,
      userId: userId,
      wsId: wsId,
      sessionId: sessionId,
      title: title,
      taskId: taskId,
      taskName: taskName,
    );
  });

  Future<void> _adopt(
    PomodoroSettings settings, {
    required String userId,
    required String wsId,
    required String sessionId,
    required String title,
    String? taskId,
    String? taskName,
  }) {
    final length = Duration(minutes: settings.focusMinutes);
    final now = _now();
    return _set(
      PomodoroState(
        phase: PomodoroPhase.focus,
        deadline: now.add(length),
        remaining: length,
        userId: userId,
        wsId: wsId,
        sessionId: sessionId,
        taskId: taskId,
        taskName: taskName,
        title: title,
        runs: [(start: now, end: null)],
      ),
    );
  }

  /// Moves the stored session id to the phase's current session, following
  /// the server's one-step resume chain. Read failures change nothing.
  Future<void> _follow() async {
    if (!state.isFocus || state.sessionId == null) return;
    final found = await _sessions.current(state);
    final id = found.session?.id;
    if (id != null && id != state.sessionId) {
      await _set(state.copyWith(sessionId: () => id), arm: false);
    }
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
    if (state.isShared) {
      await _command('pause');
      return;
    }
    var sessionId = state.sessionId;
    if (state.isFocus) {
      final found = await _sessions.current(state);
      sessionId = found.session?.id ?? sessionId;
      if (found.status == FocusSessionStatus.running) {
        await _repository.pauseSession(state.wsId!, found.session!.id);
      }
    }
    final now = _now();
    await _set(
      state.copyWith(
        deadline: () => null,
        remaining: state.remainingAt(now),
        sessionId: () => sessionId,
        runs: state.runsClosedAt(now),
      ),
    );
  });

  /// Continues a paused or waiting phase. A focus phase adopts a session
  /// already running for it, resumes its paused session, or starts one.
  Future<void> resume() => _exclusive(() async {
    if (!state.isPaused) return;
    if (state.isShared) {
      await _command('resume');
      return;
    }
    String? sessionId;
    var runs = state.runsOpenedAt(_now());
    if (state.isFocus) {
      final wsId = state.wsId!;
      final stored = state.sessionId;
      final found = stored == null
          ? (status: FocusSessionStatus.gone, session: null)
          : await _sessions.current(state);
      switch (found.status) {
        case FocusSessionStatus.running:
          sessionId = found.session!.id;
        case FocusSessionStatus.paused:
          sessionId = (await _repository.resumeSession(
            wsId,
            found.session!.id,
          )).id;
        case FocusSessionStatus.unknown:
          // Unreadable: resume the stored session rather than add another.
          sessionId = (await _repository.resumeSession(wsId, stored!)).id;
        case FocusSessionStatus.elsewhere:
          // Starting now would close the user's own running timer.
          throw const PomodoroSessionConflict();
        case FocusSessionStatus.gone:
          sessionId = (await _repository.startSession(
            wsId,
            title: state.title,
            taskId: state.taskId,
            tags: const [pomodoroSessionTag],
          )).id;
          runs = [(start: _now(), end: null)];
      }
    }
    await _set(
      state.copyWith(
        deadline: () => _now().add(state.remaining),
        sessionId: () => sessionId,
        runs: runs,
      ),
    );
  });

  /// Ends the current phase now and moves to the next one.
  Future<void> skip() => _exclusive(() async {
    if (state.isIdle) return;
    if (state.isShared) {
      await _command('skip');
      return;
    }
    await _completePhase();
    _armTimer();
  });

  /// Ends the Pomodoro. The device state is cleared first, so a session
  /// already stopped elsewhere can never leave the Pomodoro stuck; then the
  /// phase's current session is stopped (already stopped counts as done).
  Future<void> stop() => _exclusive(() async {
    if (state.isShared) {
      if (!state.isIdle) await _command('stop');
      return;
    }
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
          tags: const [pomodoroSessionTag],
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
        runs: sessionId == null ? const [] : [(start: _now(), end: null)],
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
    _detach();
    return super.close();
  }
}
