import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

/// What the server says a focus phase's tracking session is right now.
enum FocusSessionStatus {
  running,
  paused,
  gone,

  /// Gone, and a session that is not the phase's runs instead.
  elsewhere,
  unknown,
}

/// Thrown when a focus phase would start a session while an unrelated one
/// runs, which would make the server close the user's own timer.
class PomodoroSessionConflict implements Exception {
  const PomodoroSessionConflict();
}

/// The tracking session a focus phase is really on: `session` when it is
/// running or paused; null when it is gone or could not be read.
typedef FocusSession = ({
  FocusSessionStatus status,
  TimeTrackingSession? session,
});

/// Tracker-session operations for the Pomodoro.
///
/// Every action first re-reads the server, because the main Timer (or
/// another screen) can pause, resume or stop the session, and resuming
/// issues a new session id. A session belongs to the phase when it has the
/// phase's id, was resumed from it (its parent), or is for the phase's task
/// and started inside the phase's window.
class PomodoroSessions {
  const PomodoroSessions(this._repository);

  final ITimeTrackerRepository _repository;

  /// The phase's current session. A different running session means the
  /// phase's own session ended elsewhere, so it is reported as gone and the
  /// other session is never touched.
  Future<FocusSession> current(PomodoroState phase) async {
    bool mine(TimeTrackingSession? session) =>
        session != null &&
        (_linked(phase, session) || _inWindow(phase, session));
    final wsId = phase.wsId;
    if (wsId == null) return (status: FocusSessionStatus.gone, session: null);
    try {
      final running = await _repository.getRunningSession(wsId);
      if (mine(running)) {
        return (status: FocusSessionStatus.running, session: running);
      }
      if (running != null) {
        return (status: FocusSessionStatus.elsewhere, session: null);
      }
      final paused = await _repository.getPausedSession(wsId);
      if (mine(paused)) {
        return (status: FocusSessionStatus.paused, session: paused);
      }
      return (status: FocusSessionStatus.gone, session: null);
    } on Exception {
      return (status: FocusSessionStatus.unknown, session: null);
    }
  }

  /// The phase's own session, or one resumed from it. The server links a
  /// resumed session only to the session right before it, so callers must
  /// store each new id they find to keep following the chain.
  static bool _linked(PomodoroState phase, TimeTrackingSession session) {
    final id = phase.sessionId;
    return id != null && (session.id == id || session.parentSessionId == id);
  }

  /// A session for the phase's task that started inside the phase's window,
  /// so one the user starts by hand after the phase ended or paused is never
  /// taken for the phase's.
  static bool _inWindow(PomodoroState phase, TimeTrackingSession session) {
    final window = phase.sessionWindow;
    final start = session.startTime;
    return phase.taskId != null &&
        session.taskId == phase.taskId &&
        window != null &&
        start != null &&
        !start.isBefore(window.start) &&
        start.isBefore(window.end);
  }

  /// Stops the phase's session, closing a paused session's break. When the
  /// server could not be read, the stored id is tried. A session that is
  /// already stopped counts as stopped. Returns the stopped session, if any.
  Future<TimeTrackingSession?> stop(PomodoroState phase) async {
    final found = await current(phase);
    final id = switch (found.status) {
      FocusSessionStatus.running ||
      FocusSessionStatus.paused => found.session!.id,
      FocusSessionStatus.unknown => phase.sessionId,
      FocusSessionStatus.gone || FocusSessionStatus.elsewhere => null,
    };
    if (id == null) return null;
    try {
      final stopped = await _repository.stopSession(phase.wsId!, id);
      return stopped.startTime == null && found.session != null
          ? found.session
          : stopped;
    } on ApiException catch (error) {
      if (alreadyEnded(error)) return null;
      rethrow;
    }
  }

  /// Ends a late-stopped session at [deadline], only when that is after the
  /// session's start; otherwise the stop time stands. The workspace's edit
  /// rules may also refuse the edit.
  Future<void> trimTo(
    PomodoroState phase,
    TimeTrackingSession session,
    DateTime deadline,
  ) async {
    final start = session.startTime;
    if (start == null || !deadline.isAfter(start)) return;
    try {
      await _repository.editSession(phase.wsId!, session.id, endTime: deadline);
    } on Exception {
      // Over the workspace's edit threshold; the stop time stands.
    }
  }

  /// Statuses with which the tracker reports a session that is already
  /// stopped or no longer exists.
  static bool alreadyEnded(ApiException error) =>
      error.statusCode == 400 ||
      error.statusCode == 404 ||
      error.statusCode == 409;
}
