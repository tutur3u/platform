import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

import 'pomodoro_fakes.dart';

void main() {
  late DateTime now;
  late FakeTracker tracker;
  late FakeNotifier notifier;
  var settings = const PomodoroSettings();

  Future<PomodoroController> focusing() async {
    final controller = PomodoroController(
      repository: tracker,
      loadSettings: () async => settings,
      notificationCopy: (_) => (title: 'Focus', body: ''),
      notifier: notifier,
      store: FakeStore(),
      now: () => now,
    );
    addTearDown(controller.close);
    await controller.startFocus(userId: 'u1', wsId: 'ws', title: 'Task');
    return controller;
  }

  setUp(() {
    now = DateTime(2026, 10, 27, 9);
    tracker = FakeTracker(() => now);
    notifier = FakeNotifier();
    settings = const PomodoroSettings();
  });

  test('waiting focus resume preserves another running timer', () async {
    final controller = await focusing();
    await controller.skip();
    await controller.skip();
    expect(controller.state.phase, PomodoroPhase.focus);
    expect(controller.state.sessionId, isNull);
    final manual = (await tracker.startSession('ws', taskId: 'other')).id;
    final starts = tracker.startCount;

    await expectLater(
      controller.resume(),
      throwsA(isA<PomodoroSessionConflict>()),
    );

    expect(tracker.runningId, manual);
    expect(tracker.startCount, starts);
    expect(controller.state.isPaused, isTrue);
  });

  test('automatic next focus preserves another running timer', () async {
    settings = const PomodoroSettings(
      autoStartBreaks: true,
      autoStartFocus: true,
    );
    final controller = await focusing();
    await controller.skip();
    final manual = (await tracker.startSession('ws', taskId: 'other')).id;
    final starts = tracker.startCount;
    now = now.add(const Duration(minutes: 5, seconds: 20));

    await controller.reconcile();

    expect(tracker.runningId, manual);
    expect(tracker.startCount, starts);
    expect(controller.state.phase, PomodoroPhase.focus);
    expect(controller.state.isPaused, isTrue);
    expect(controller.state.sessionId, isNull);
    expect(notifier.scheduledAt, isNull);
  });
}
