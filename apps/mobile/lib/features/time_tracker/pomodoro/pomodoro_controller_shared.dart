part of 'pomodoro_controller.dart';

/// The shared, cross-device Pomodoro. The server plans every phase change
/// and owns the focus sessions; this device sends commands, mirrors the
/// server's state and schedules its own notification from the shared
/// deadline. Nothing here starts focus without the user.
extension _SharedPomodoro on PomodoroController {
  /// Follows the server's Pomodoro for [wsId] unless this device runs its own.
  Future<void> _attach(String userId, String wsId) async {
    final remote = _remote;
    if (remote == null || isClosed) return;
    if (!state.isIdle && !state.isShared) return;
    final RemotePomodoro found;
    try {
      found = await remote.read(wsId);
    } on Exception {
      return; // Older server or offline: the device Pomodoro stays.
    }
    _subscribe(userId, wsId);
    await _mirror(found, userId: userId, wsId: wsId);
  }

  void _subscribe(String userId, String wsId) {
    final attached = _attached;
    if (attached?.userId == userId && attached?.wsId == wsId) return;
    unawaited(_unsubscribe?.call());
    _attached = (userId: userId, wsId: wsId);
    _unsubscribe = _remote!.subscribe(wsId, userId, () {
      if (!isClosed) unawaited(_exclusive(_refresh));
    });
  }

  void _detach() {
    unawaited(_unsubscribe?.call());
    _unsubscribe = null;
    _attached = null;
  }

  /// Reads the server again, unless a device Pomodoro runs here.
  Future<void> _refresh() async {
    final attached = _attached;
    if (attached == null || !_mirrors) return;
    final (:userId, :wsId) = attached;
    try {
      await _mirror(await _remote!.read(wsId), userId: userId, wsId: wsId);
    } on Exception {
      _armTimer(); // Offline: keep counting; the next read corrects it.
    }
  }

  /// Shows [found] as this device's state, with its notification.
  Future<void> _mirror(
    RemotePomodoro found, {
    required String userId,
    required String wsId,
    String? taskName,
  }) {
    final sameTask = found.taskId != null && found.taskId == state.taskId;
    return _set(
      PomodoroState(
        phase: found.phase,
        deadline: found.deadline,
        remaining: found.remaining,
        completedFocus: found.completedFocus,
        userId: userId,
        wsId: wsId,
        sessionId: found.sessionId,
        taskId: found.taskId,
        taskName: taskName ?? (sameTask ? state.taskName : null),
        title: found.title,
        revision: found.revision,
      ),
    );
  }

  /// Starts shared focus, first matching the server's durations to this
  /// device's settings. Throws [PomodoroRemoteUnavailable] on an older
  /// server, so the caller falls back to the device Pomodoro.
  Future<void> _startShared({
    required String userId,
    required String wsId,
    required String title,
    String? taskId,
    String? taskName,
    TimeTrackingSession? replacingPaused,
  }) async {
    final remote = _remote!;
    final settings = await _loadSettings();
    var current = await remote.read(wsId);
    if (current.config != settings) {
      current = await remote.configure(
        wsId,
        expectedRevision: current.revision,
        settings: settings,
      );
    }
    if (replacingPaused != null) {
      await _repository.stopSession(wsId, replacingPaused.id);
    }
    final RemotePomodoro started;
    try {
      started = await remote.command(
        wsId,
        type: 'start',
        expectedRevision: current.revision,
        title: title,
        taskId: taskId,
      );
    } on Exception {
      if (replacingPaused != null) {
        await _restorePaused(wsId, replacingPaused);
      }
      rethrow;
    }
    _subscribe(userId, wsId);
    await _mirror(started, userId: userId, wsId: wsId, taskName: taskName);
  }

  /// Sends [type] against the mirrored revision. When the Pomodoro changed
  /// elsewhere first, this device shows the server's state instead.
  Future<void> _command(String type) async {
    final wsId = state.wsId!;
    final userId = state.userId!;
    final remote = _remote!;
    try {
      await _mirror(
        await remote.command(
          wsId,
          type: type,
          expectedRevision: state.revision!,
        ),
        userId: userId,
        wsId: wsId,
      );
    } on PomodoroRemoteConflict {
      await _mirror(await remote.read(wsId), userId: userId, wsId: wsId);
    } on ApiException catch (error) {
      // A command that no longer applies (422): show what the server has.
      if (error.statusCode != 422) rethrow;
      await _mirror(await remote.read(wsId), userId: userId, wsId: wsId);
    }
  }

  /// Persists due phase ends on the server; it never starts focus.
  Future<void> _reconcileShared() async {
    final deadline = state.deadline;
    if (state.isRunning && deadline != null && !deadline.isAfter(_now())) {
      try {
        await _command('reconcile');
        return;
      } on Exception {
        // Offline: the local notification already fired; read again later.
      }
    }
    await _refresh();
  }
}
