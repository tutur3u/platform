import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_store.dart';

enum _Status { running, paused, stopped }

class _Session {
  _Session(this.id, this.taskId, this.start, {this.parent});

  final String id;
  final String? taskId;
  final DateTime start;
  final String? parent;
  _Status status = _Status.running;

  TimeTrackingSession get model => TimeTrackingSession(
    id: id,
    taskId: taskId,
    startTime: start,
    parentSessionId: parent,
  );
}

/// A tracker that behaves like the server: starting closes the running
/// session, resuming issues a new id whose parent is the resumed one, and
/// stopping an ended session fails with 400.
class FakeTracker extends Fake implements ITimeTrackerRepository {
  FakeTracker(this.clock);

  final DateTime Function() clock;
  final List<String> calls = [];
  final Map<String, _Session> _sessions = {};
  int _next = 0;

  /// Tags each session was started with.
  final Map<String, List<String>> tagsOf = {};

  /// Endings applied by trims, by session id.
  final Map<String, DateTime> trimmedTo = {};

  String? get runningId => _sessions.values
      .where((s) => s.status == _Status.running)
      .map((s) => s.id)
      .firstOrNull;

  /// The latest paused session, as the server's `type=paused` read returns.
  String? get pausedId => _sessions.values
      .where((s) => s.status == _Status.paused)
      .map((s) => s.id)
      .lastOrNull;

  /// Session ids whose stop fails, as when the request cannot reach the
  /// server.
  final Set<String> failStop = {};
  bool failResume = false;

  DateTime startOf(String id) => _sessions[id]!.start;

  /// Simulates the main Timer pausing and resuming the running session.
  String pauseAndResumeElsewhere() {
    final id = runningId!;
    _sessions[id]!.status = _Status.stopped;
    final next = _Session(
      's${++_next}',
      _sessions[id]!.taskId,
      clock(),
      parent: id,
    );
    _sessions[next.id] = next;
    return next.id;
  }

  /// Simulates the user pausing a session on the main Timer.
  void pauseElsewhere(String id) => _sessions[id]!.status = _Status.paused;

  /// Simulates the session being stopped from another screen.
  void stopElsewhere(String id) => _sessions[id]!.status = _Status.stopped;

  int get startCount => calls.where((c) => c.startsWith('start')).length;

  @override
  Future<TimeTrackingSession?> getRunningSession(String wsId) async {
    final id = runningId;
    return id == null ? null : _sessions[id]!.model;
  }

  @override
  Future<TimeTrackingSession?> getPausedSession(String wsId) async {
    final id = pausedId;
    return id == null ? null : _sessions[id]!.model;
  }

  @override
  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
    List<String>? tags,
  }) async {
    for (final s in _sessions.values) {
      if (s.status == _Status.running) s.status = _Status.stopped;
    }
    final session = _Session('s${++_next}', taskId, clock());
    _sessions[session.id] = session;
    tagsOf[session.id] = tags ?? const [];
    calls.add('start:${session.id}:$taskId');
    return session.model;
  }

  @override
  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    if (failStop.contains(sessionId)) throw Exception('offline');
    final session = _sessions[sessionId];
    if (session == null || session.status == _Status.stopped) {
      calls.add('stop-rejected:$sessionId');
      throw const ApiException(message: 'Already stopped', statusCode: 400);
    }
    session.status = _Status.stopped;
    calls.add('stop:$sessionId');
    return session.model;
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    _sessions[sessionId]!.status = _Status.paused;
    calls.add('pause:$sessionId');
    return _sessions[sessionId]!.model;
  }

  @override
  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    if (failResume) throw Exception('offline');
    _sessions[sessionId]!.status = _Status.stopped;
    final next = _Session(
      's${++_next}',
      _sessions[sessionId]!.taskId,
      clock(),
      parent: sessionId,
    );
    _sessions[next.id] = next;
    calls.add('resume:$sessionId->${next.id}');
    return next.model;
  }

  @override
  Future<TimeTrackingSession> editSession(
    String wsId,
    String sessionId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    DateTime? startTime,
    DateTime? endTime,
  }) async {
    trimmedTo[sessionId] = endTime!;
    calls.add('trim:$sessionId');
    return _sessions[sessionId]!.model;
  }
}

class FakeNotifier implements PomodoroNotifier {
  DateTime? scheduledAt;
  String? title;

  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
    String? wsId,
    String? userId,
  }) async {
    scheduledAt = at;
    this.title = title;
  }

  @override
  Future<void> cancel() async => scheduledAt = null;
}

class FakeStore extends PomodoroStore {
  PomodoroState? saved;
  int reads = 0;

  /// When set, saving a running phase fails.
  bool failWrite = false;

  @override
  Future<PomodoroState?> read() async {
    reads++;
    // Yield, so concurrent restores could interleave without a guard.
    await Future<void>.delayed(Duration.zero);
    return saved;
  }

  @override
  Future<void> write(PomodoroState state) async {
    if (failWrite && !state.isIdle) throw Exception('storage full');
    saved = state.isIdle ? null : state;
  }
}
