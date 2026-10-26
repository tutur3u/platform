import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

/// What the server says a focus phase's tracking session is right now.
enum FocusSessionStatus { running, paused, gone, unknown }

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
/// phase's id, was resumed from it (its parent), or, for a task-linked
/// phase, has the phase's task.
class PomodoroSessions {
  const PomodoroSessions(this._repository);

  final ITimeTrackerRepository _repository;

  /// The phase's current session. A different running session means the
  /// phase's own session ended elsewhere, so it is reported as gone and the
  /// other session is never touched.
  Future<FocusSession> current(PomodoroState phase) async {
    bool mine(TimeTrackingSession? session) =>
        session != null &&
        (session.id == phase.sessionId ||
            (phase.sessionId != null &&
                session.parentSessionId == phase.sessionId) ||
            (phase.taskId != null && session.taskId == phase.taskId));
    final wsId = phase.wsId;
    if (wsId == null) return (status: FocusSessionStatus.gone, session: null);
    try {
      final running = await _repository.getRunningSession(wsId);
      if (mine(running)) {
        return (status: FocusSessionStatus.running, session: running);
      }
      if (running != null) {
        return (status: FocusSessionStatus.gone, session: null);
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

  /// Stops the phase's session, closing a paused session's break. When the
  /// server could not be read, the stored id is tried. A session that is
  /// already stopped counts as stopped. Returns the stopped session, if any.
  Future<TimeTrackingSession?> stop(PomodoroState phase) async {
    final found = await current(phase);
    final id = switch (found.status) {
      FocusSessionStatus.running ||
      FocusSessionStatus.paused => found.session!.id,
      FocusSessionStatus.unknown => phase.sessionId,
      FocusSessionStatus.gone => null,
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
