import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_remote.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

import 'pomodoro_fakes.dart';

/// A server that answers each command with the next scripted state.
class FakeRemote extends Fake implements PomodoroRemote {
  FakeRemote(this.server);

  RemotePomodoro server;
  final List<String> calls = [];
  final List<RemotePomodoro> replies = [];
  Exception? failCommand;
  bool unavailable = false;
  void Function()? onChange;

  @override
  Future<RemotePomodoro> read(String wsId) async {
    calls.add('read');
    if (unavailable) throw const PomodoroRemoteUnavailable();
    return server;
  }

  @override
  Future<RemotePomodoro> configure(
    String wsId, {
    required int expectedRevision,
    required PomodoroSettings settings,
  }) async {
    calls.add('configure@$expectedRevision');
    return server = remote(
      revision: server.revision + 1,
      phase: server.phase,
      config: settings,
    );
  }

  @override
  Future<RemotePomodoro> command(
    String wsId, {
    required String type,
    required int expectedRevision,
    String? title,
    String? taskId,
  }) async {
    calls.add('$type@$expectedRevision');
    final failure = failCommand;
    if (failure != null) {
      failCommand = null;
      throw failure;
    }
    return server = replies.removeAt(0);
  }

  @override
  Future<void> Function() subscribe(
    String wsId,
    String userId,
    void Function() onChange,
  ) {
    calls.add('subscribe:$wsId/$userId');
    this.onChange = onChange;
    return () async {};
  }
}

RemotePomodoro remote({
  int revision = 1,
  PomodoroPhase phase = PomodoroPhase.idle,
  DateTime? deadline,
  Duration remaining = Duration.zero,
  int completedFocus = 0,
  String? sessionId,
  PomodoroSettings? config = const PomodoroSettings(),
}) => (
  revision: revision,
  phase: phase,
  deadline: deadline,
  remaining: remaining,
  completedFocus: completedFocus,
  sessionId: sessionId,
  taskId: phase == PomodoroPhase.idle ? null : 't1',
  title: phase == PomodoroPhase.idle ? null : 'Write report',
  config: config,
);

void main() {
  late FakeTracker tracker;
  late FakeNotifier notifier;
  late FakeRemote server;
  late DateTime now;
  var settings = const PomodoroSettings();

  PomodoroController build() => PomodoroController(
    repository: tracker,
    loadSettings: () async => settings,
    notificationCopy: (phase) => (title: phase.name, body: ''),
    notifier: notifier,
    store: FakeStore(),
    remote: server,
    now: () => now,
  );

  RemotePomodoro focusUntil(int minutes, {int revision = 2}) => remote(
    revision: revision,
    phase: PomodoroPhase.focus,
    deadline: now.add(Duration(minutes: minutes)),
    remaining: Duration(minutes: minutes),
    sessionId: 's9',
  );

  Future<PomodoroController> focusing() async {
    final controller = build();
    server.replies.add(focusUntil(25));
    await controller.startFocus(
      userId: 'u1',
      wsId: 'ws',
      title: 'Write report',
      taskId: 't1',
      taskName: 'Write report',
    );
    return controller;
  }

  setUp(() {
    now = DateTime(2026, 10, 26, 9);
    tracker = FakeTracker(() => now);
    notifier = FakeNotifier();
    server = FakeRemote(remote());
    settings = const PomodoroSettings();
  });

  test('start runs on the server and mirrors its deadline', () async {
    final controller = await focusing();

    expect(server.calls, ['read', 'start@1', 'subscribe:ws/u1']);
    expect(tracker.startCount, 0);
    expect(controller.state.isShared, isTrue);
    expect(controller.state.revision, 2);
    expect(controller.state.sessionId, 's9');
    expect(controller.state.taskName, 'Write report');
    expect(notifier.scheduledAt, now.add(const Duration(minutes: 25)));
    await controller.close();
  });

  test('changed settings reach the server before the start', () async {
    settings = const PomodoroSettings(focusMinutes: 50);
    await focusing();
    expect(server.calls.take(3), ['read', 'configure@1', 'start@2']);
  });

  test('a phase end is settled by the server and never starts focus', () async {
    final controller = await focusing();
    now = now.add(const Duration(minutes: 40));
    server.replies.add(
      remote(revision: 3, phase: PomodoroPhase.focus, remaining: 25.minutes),
    );

    await controller.reconcile();

    expect(server.calls.last, 'reconcile@2');
    expect(
      server.calls.where((call) => call.startsWith('start')),
      hasLength(1),
    );
    expect(tracker.startCount, 0);
    expect(controller.state.isPaused, isTrue);
    expect(notifier.scheduledAt, isNull);
    await controller.close();
  });

  test('pause, resume, skip and stop send the mirrored revision', () async {
    final controller = await focusing();
    server.replies.addAll([
      remote(revision: 3, phase: PomodoroPhase.focus, sessionId: 's9'),
      focusUntil(10, revision: 4),
      remote(revision: 5, phase: PomodoroPhase.shortBreak),
      remote(revision: 6),
    ]);

    await controller.pause();
    await controller.resume();
    await controller.skip();
    await controller.stop();

    expect(server.calls.skip(3), ['pause@2', 'resume@3', 'skip@4', 'stop@5']);
    expect(controller.state.isIdle, isTrue);
    expect(tracker.calls, isEmpty);
    await controller.close();
  });

  test('a change made elsewhere first shows the server state', () async {
    final controller = await focusing();
    server
      ..failCommand = const PomodoroRemoteConflict()
      ..server = remote(revision: 7, phase: PomodoroPhase.longBreak);

    await controller.pause();

    expect(controller.state.phase, PomodoroPhase.longBreak);
    expect(controller.state.revision, 7);
    await controller.close();
  });

  test('a running manual timer stops the shared start', () async {
    final controller = build();
    server.failCommand = const PomodoroSessionConflict();
    await expectLater(
      controller.startFocus(userId: 'u1', wsId: 'ws', title: 'Write report'),
      throwsA(isA<PomodoroSessionConflict>()),
    );
    expect(controller.state.isIdle, isTrue);
    await controller.close();
  });

  test('an older server keeps the device Pomodoro', () async {
    server.unavailable = true;
    final controller = await focusing();

    expect(tracker.startCount, 1);
    expect(controller.state.isShared, isFalse);
    expect(controller.state.isRunning, isTrue);

    server.unavailable = false;
    await controller.attach(userId: 'u1', wsId: 'ws');
    expect(controller.state.isShared, isFalse);
    await controller.close();
  });

  test('attach mirrors another device and follows its changes', () async {
    final controller = build();
    server.server = focusUntil(12, revision: 4);

    await controller.attach(userId: 'u1', wsId: 'ws');
    expect(controller.state.revision, 4);
    expect(controller.state.isRunning, isTrue);

    server.server = remote(revision: 5);
    server.onChange!();
    await controller.reconcile();
    expect(controller.state.isIdle, isTrue);
    expect(notifier.scheduledAt, isNull);
    await controller.close();
  });

  test('server deadlines move onto the device clock', () {
    final device = DateTime.utc(2026, 10, 26, 9);
    final parsed = PomodoroRemote.parse({
      // The server clock is 30 seconds ahead of the device.
      'serverNow': '2026-10-26T09:00:30.000Z',
      'state': {
        'revision': 3,
        'phase': 'short_break',
        'deadlineAt': '2026-10-26T09:05:30.000Z',
        'remainingMs': 300000,
        'completedFocus': 1,
        'sessionId': null,
        'taskId': null,
        'title': 'Write report',
      },
    }, device);

    expect(parsed.phase, PomodoroPhase.shortBreak);
    expect(parsed.deadline!.toUtc(), DateTime.utc(2026, 10, 26, 9, 5));
    expect(parsed.remaining, const Duration(minutes: 5));
  });
}

extension on int {
  Duration get minutes => Duration(minutes: this);
}
