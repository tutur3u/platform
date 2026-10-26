import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_store.dart';

class _Repository extends Fake implements ITimeTrackerRepository {
  final List<String> calls = [];
  int _next = 0;

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
  }) async {
    final id = 's${++_next}';
    calls.add('start:$id:$taskId');
    return TimeTrackingSession(id: id, taskId: taskId);
  }

  @override
  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    calls.add('stop:$sessionId');
    return TimeTrackingSession(id: sessionId);
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    calls.add('pause:$sessionId');
    return TimeTrackingSession(id: sessionId);
  }

  @override
  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    final id = 's${++_next}';
    calls.add('resume:$sessionId->$id');
    return TimeTrackingSession(id: id);
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
    calls.add('trim:$sessionId:${endTime?.toIso8601String()}');
    return TimeTrackingSession(id: sessionId);
  }
}

class _Notifier implements PomodoroNotifier {
  DateTime? scheduledAt;
  String? title;
  int cancels = 0;

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
  Future<void> cancel() async {
    cancels++;
    scheduledAt = null;
  }
}

class _Store extends PomodoroStore {
  PomodoroState? saved;

  @override
  Future<PomodoroState?> read() async => saved;

  @override
  Future<void> write(PomodoroState state) async {
    saved = state.isIdle ? null : state;
  }
}

void main() {
  late _Repository repository;
  late _Notifier notifier;
  late _Store store;
  late DateTime now;
  var settings = const PomodoroSettings();

  PomodoroController build() => PomodoroController(
    repository: repository,
    loadSettings: () async => settings,
    notificationCopy: (phase) => (
      title: phase == PomodoroPhase.focus ? 'Focus done' : 'Break over',
      body: '',
    ),
    notifier: notifier,
    store: store,
    now: () => now,
  );

  setUp(() {
    repository = _Repository();
    notifier = _Notifier();
    store = _Store();
    now = DateTime(2026, 10, 26, 9);
    settings = const PomodoroSettings();
  });

  Future<PomodoroController> focusing() async {
    final controller = build();
    await controller.startFocus(
      userId: 'u1',
      wsId: 'ws',
      title: 'Write report',
      taskId: 't1',
      taskName: 'Write report',
    );
    return controller;
  }

  test('focus starts a linked session and schedules its end', () async {
    final controller = await focusing();
    addTearDown(controller.close);

    expect(repository.calls, ['start:s1:t1']);
    expect(controller.state.phase, PomodoroPhase.focus);
    expect(controller.state.sessionId, 's1');
    expect(notifier.scheduledAt, now.add(const Duration(minutes: 25)));
    expect(notifier.title, 'Focus done');
    expect(store.saved, controller.state);
  });

  test('pause holds time and session; resume continues both', () async {
    final controller = await focusing();
    addTearDown(controller.close);
    now = now.add(const Duration(minutes: 10));

    await controller.pause();
    expect(repository.calls.last, 'pause:s1');
    expect(controller.state.isPaused, isTrue);
    expect(controller.state.remaining, const Duration(minutes: 15));
    expect(notifier.scheduledAt, isNull);

    now = now.add(const Duration(minutes: 3));
    await controller.resume();
    expect(repository.calls.last, 'resume:s1->s2');
    expect(controller.state.sessionId, 's2');
    expect(notifier.scheduledAt, now.add(const Duration(minutes: 15)));
  });

  test('ending focus stops the session and waits on a short break', () async {
    final controller = await focusing();
    addTearDown(controller.close);

    await controller.skip();

    expect(repository.calls.last, 'stop:s1');
    expect(controller.state.phase, PomodoroPhase.shortBreak);
    expect(controller.state.isPaused, isTrue);
    expect(controller.state.remaining, const Duration(minutes: 5));
    expect(controller.state.sessionId, isNull);
  });

  test('auto-start runs phases; every fourth break is long', () async {
    settings = const PomodoroSettings(
      autoStartBreaks: true,
      autoStartFocus: true,
    );
    final controller = await focusing();
    addTearDown(controller.close);

    for (var i = 0; i < 3; i++) {
      await controller.skip(); // focus -> break
      expect(controller.state.phase, PomodoroPhase.shortBreak);
      expect(controller.state.isRunning, isTrue);
      await controller.skip(); // break -> focus with a new session
      expect(controller.state.phase, PomodoroPhase.focus);
      expect(controller.state.sessionId, isNotNull);
    }
    await controller.skip();
    expect(controller.state.phase, PomodoroPhase.longBreak);
    expect(controller.state.remaining, const Duration(minutes: 15));
  });

  test('focus after a break waits and starts its session on resume', () async {
    final controller = await focusing();
    addTearDown(controller.close);
    await controller.skip(); // waiting break
    await controller.resume(); // run the break
    await controller.skip(); // break -> waiting focus

    expect(controller.state.phase, PomodoroPhase.focus);
    expect(controller.state.isPaused, isTrue);
    expect(controller.state.sessionId, isNull);
    await controller.resume();
    expect(repository.calls.last, 'start:s2:t1');
  });

  test('stop closes the session and clears the device state', () async {
    final controller = await focusing();
    addTearDown(controller.close);

    await controller.stop();

    expect(repository.calls.last, 'stop:s1');
    expect(controller.state.isIdle, isTrue);
    expect(store.saved, isNull);
    expect(notifier.scheduledAt, isNull);
  });

  test('restore ends an expired focus at its deadline', () async {
    settings = const PomodoroSettings(
      autoStartBreaks: true,
      autoStartFocus: true,
    );
    final deadline = now.subtract(const Duration(minutes: 40));
    store.saved = PomodoroState(
      phase: PomodoroPhase.focus,
      deadline: deadline,
      remaining: const Duration(minutes: 25),
      userId: 'u1',
      wsId: 'ws',
      sessionId: 's9',
      taskId: 't1',
    );
    final controller = build();
    addTearDown(controller.close);

    await controller.restore('u1');

    // Stopped late, then trimmed back to the deadline.
    expect(repository.calls, [
      'stop:s9',
      'trim:s9:${deadline.toIso8601String()}',
    ]);
    // The break also ran out while closed; focus waits instead of starting
    // a session for time nobody was there for.
    expect(controller.state.phase, PomodoroPhase.focus);
    expect(controller.state.isPaused, isTrue);
    expect(controller.state.sessionId, isNull);
  });

  test("another account's Pomodoro is discarded on restore", () async {
    store.saved = PomodoroState(
      phase: PomodoroPhase.focus,
      deadline: now.add(const Duration(minutes: 5)),
      userId: 'someone-else',
      wsId: 'ws',
      sessionId: 's9',
    );
    final controller = build();
    addTearDown(controller.close);

    await controller.restore('u1');

    expect(controller.state.isIdle, isTrue);
    expect(store.saved, isNull);
    expect(repository.calls, isEmpty);
  });

  testWidgets('the phase ends on its own at the deadline', (tester) async {
    final controller = await focusing();
    addTearDown(controller.close);

    now = now.add(const Duration(minutes: 25));
    await tester.pump(const Duration(minutes: 25));
    await tester.pump();

    expect(repository.calls.last, 'stop:s1');
    expect(controller.state.phase, PomodoroPhase.shortBreak);
  });
}
