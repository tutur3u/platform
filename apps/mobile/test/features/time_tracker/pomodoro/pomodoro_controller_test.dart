import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_sessions.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';

import 'pomodoro_fakes.dart';

void main() {
  late FakeTracker tracker;
  late FakeNotifier notifier;
  late FakeStore store;
  late DateTime now;
  late DateTime t0;
  var settings = const PomodoroSettings();
  var failSettings = false;
  const autoBoth = PomodoroSettings(
    autoStartBreaks: true,
    autoStartFocus: true,
  );

  PomodoroController build() => PomodoroController(
    repository: tracker,
    loadSettings: () async {
      if (failSettings) throw Exception('settings unavailable');
      return settings;
    },
    notificationCopy: (phase) => (
      title: phase == PomodoroPhase.focus ? 'Focus done' : 'Break over',
      body: '',
    ),
    notifier: notifier,
    store: store,
    now: () => now,
  );

  setUp(() {
    t0 = DateTime(2026, 10, 26, 9);
    now = t0;
    tracker = FakeTracker(() => now);
    notifier = FakeNotifier();
    store = FakeStore();
    settings = const PomodoroSettings();
    failSettings = false;
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

    expect(tracker.calls, ['start:s1:t1']);
    expect(controller.state.sessionId, 's1');
    expect(notifier.scheduledAt, t0.add(const Duration(minutes: 25)));
    expect(store.saved, controller.state);
  });

  test('pause holds time and session; resume continues both', () async {
    final controller = await focusing();
    addTearDown(controller.close);
    now = now.add(const Duration(minutes: 10));

    await controller.pause();
    expect(tracker.calls.last, 'pause:s1');
    expect(controller.state.remaining, const Duration(minutes: 15));
    expect(notifier.scheduledAt, isNull);

    now = now.add(const Duration(minutes: 3));
    await controller.resume();
    expect(tracker.calls.last, 'resume:s1->s2');
    expect(controller.state.sessionId, 's2');
    expect(notifier.scheduledAt, now.add(const Duration(minutes: 15)));
  });

  test('auto-start runs on-time phases; every fourth break is long', () async {
    settings = autoBoth;
    final controller = await focusing();
    addTearDown(controller.close);

    for (var i = 0; i < 3; i++) {
      await controller.skip();
      expect(controller.state.phase, PomodoroPhase.shortBreak);
      expect(controller.state.isRunning, isTrue);
      await controller.skip();
      expect(controller.state.phase, PomodoroPhase.focus);
      expect(controller.state.sessionId, tracker.runningId);
    }
    await controller.skip();
    expect(controller.state.phase, PomodoroPhase.longBreak);
  });

  group('missed phase ends (review 1)', () {
    test('a sleep across many cycles starts no focus sessions', () async {
      settings = autoBoth;
      final controller = await focusing();
      addTearDown(controller.close);

      // Asleep for three hours: many focus/break cycles would have passed.
      now = t0.add(const Duration(hours: 3));
      await controller.reconcile();

      expect(tracker.startCount, 1, reason: 'only the original start');
      // The real session ends at its own deadline, after its start.
      expect(tracker.calls, ['start:s1:t1', 'stop:s1', 'trim:s1']);
      expect(tracker.trimmedTo['s1'], t0.add(const Duration(minutes: 25)));
      expect(tracker.runningId, isNull);
      expect(controller.state.phase, PomodoroPhase.focus);
      expect(controller.state.isPaused, isTrue);
      expect(controller.state.sessionId, isNull);
    });

    test('a late phase timer is catch-up too', () async {
      settings = autoBoth;
      final controller = await focusing();
      addTearDown(controller.close);
      await controller.skip(); // focus -> running break, on time
      expect(controller.state.isRunning, isTrue);

      // The break timer fires an hour late (the app was suspended).
      now = now.add(const Duration(hours: 1));
      await controller.reconcile();

      expect(tracker.startCount, 1);
      expect(controller.state.phase, PomodoroPhase.focus);
      expect(controller.state.isPaused, isTrue);
    });

    test('an auto-started focus counts from its real start', () async {
      settings = autoBoth;
      final controller = await focusing();
      addTearDown(controller.close);
      await controller.skip(); // running break
      now = now.add(const Duration(minutes: 5, seconds: 20)); // on time
      await controller.reconcile();

      expect(tracker.startCount, 2);
      expect(controller.state.deadline, now.add(const Duration(minutes: 25)));
    });

    test('a session is never trimmed to before its start', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      // The main Timer resumed the session after the phase deadline, while
      // this device slept: the real session starts after the deadline.
      now = t0.add(const Duration(minutes: 30));
      final real = tracker.pauseAndResumeElsewhere();
      now = t0.add(const Duration(minutes: 50));

      await controller.reconcile();

      expect(tracker.calls, contains('stop:$real'));
      expect(tracker.trimmedTo, isEmpty);
    });
  });

  group('stale session ids (review 4)', () {
    test('a phase end stops the real session, not the stale id', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      now = t0.add(const Duration(minutes: 10));
      final real = tracker.pauseAndResumeElsewhere();

      await controller.skip();

      expect(tracker.calls, contains('stop:$real'));
      expect(tracker.calls, isNot(contains('stop:s1')));
      expect(tracker.runningId, isNull);
    });

    test('pause pauses the real session', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      final real = tracker.pauseAndResumeElsewhere();

      await controller.pause();

      expect(tracker.calls.last, 'pause:$real');
      expect(controller.state.sessionId, real);
    });

    test('an unrelated running session is never touched', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      await tracker.startSession('ws', taskId: 'other');

      await controller.skip();

      expect(tracker.runningId, isNotNull);
      expect(tracker.calls.where((c) => c.startsWith('stop')), isEmpty);
    });
  });

  group('manual sessions on the same task (re-review 1)', () {
    test('one started after the phase ended is never touched', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      now = t0.add(const Duration(minutes: 5));
      tracker.stopElsewhere('s1');
      // After the 25-minute phase ended, the user times the task by hand.
      now = t0.add(const Duration(minutes: 40));
      final manual = (await tracker.startSession('ws', taskId: 't1')).id;
      now = t0.add(const Duration(minutes: 50));

      await controller.reconcile();

      expect(tracker.runningId, manual);
      expect(tracker.calls, isNot(contains('stop:$manual')));
      expect(tracker.trimmedTo, isEmpty);
    });

    test('stop of a paused phase leaves a later manual session', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      now = t0.add(const Duration(minutes: 5));
      await controller.pause();
      tracker.stopElsewhere('s1');
      now = t0.add(const Duration(minutes: 8));
      final manual = (await tracker.startSession('ws', taskId: 't1')).id;

      await controller.stop();

      expect(controller.state.isIdle, isTrue);
      expect(tracker.runningId, manual);
      expect(tracker.calls, isNot(contains('stop:$manual')));
    });

    test('resume will not close a manual session', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      now = t0.add(const Duration(minutes: 5));
      await controller.pause();
      tracker.stopElsewhere('s1');
      now = t0.add(const Duration(minutes: 8));
      final manual = (await tracker.startSession('ws', taskId: 't1')).id;
      final starts = tracker.startCount;

      await expectLater(
        controller.resume(),
        throwsA(isA<PomodoroSessionConflict>()),
      );

      expect(tracker.startCount, starts);
      expect(tracker.runningId, manual);
      expect(controller.state.isPaused, isTrue);
    });

    test("a task session inside the phase window is the phase's", () async {
      final controller = await focusing();
      addTearDown(controller.close);
      // Two unobserved pause/resume cycles on the main Timer break the
      // one-step parent link; the window still identifies the session.
      now = t0.add(const Duration(minutes: 3));
      tracker.pauseAndResumeElsewhere();
      now = t0.add(const Duration(minutes: 6));
      final real = tracker.pauseAndResumeElsewhere();

      await controller.skip();

      expect(tracker.calls.last, 'stop:$real');
    });
  });

  group('resume chain (re-review 2)', () {
    test('the stored id follows every resume of a taskless phase', () async {
      final controller = build();
      addTearDown(controller.close);
      await controller.startFocus(userId: 'u1', wsId: 'ws', title: 'Deep');
      String? last;
      for (var cycle = 0; cycle < 3; cycle++) {
        now = now.add(const Duration(minutes: 2));
        last = tracker.pauseAndResumeElsewhere();
        // Resume and the phase timer reconcile, following the chain.
        await controller.reconcile();
        expect(controller.state.sessionId, last);
      }

      await controller.skip();

      expect(tracker.calls.last, 'stop:$last');
      expect(tracker.runningId, isNull);
    });

    test('the fake links a resume only to the session before it', () async {
      await tracker.startSession('ws');
      final second = tracker.pauseAndResumeElsewhere();
      final third = tracker.pauseAndResumeElsewhere();
      final running = await tracker.getRunningSession('ws');

      expect(running!.id, third);
      expect(running.parentSessionId, second);
    });
  });

  group('startFocus holds the lock (re-review 3)', () {
    test('a phase end due at the same time runs first, then focus', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      now = t0.add(const Duration(minutes: 25));

      await Future.wait([
        controller.reconcile(),
        controller.startFocus(
          userId: 'u1',
          wsId: 'ws',
          title: 'Next',
          taskId: 't2',
        ),
      ]);

      expect(tracker.calls, ['start:s1:t1', 'stop:s1', 'start:s2:t2']);
      expect(controller.state.phase, PomodoroPhase.focus);
      expect(controller.state.sessionId, 's2');
      expect(tracker.runningId, 's2');
    });

    test('settings that fail to load leave no orphan session', () async {
      final controller = build();
      addTearDown(controller.close);
      await tracker.startSession('ws', taskId: 'old');
      await tracker.pauseSession('ws', 's1');
      failSettings = true;

      await expectLater(
        controller.startFocus(
          userId: 'u1',
          wsId: 'ws',
          title: 'New',
          taskId: 't1',
          replacingPaused: (await controller.currentTracking('ws')).paused,
        ),
        throwsException,
      );

      expect(tracker.startCount, 1, reason: 'only the setup start');
      expect(tracker.pausedId, 's1', reason: 'the paused session is kept');
      expect(controller.state.isIdle, isTrue);
    });
  });

  group('stop (review 3)', () {
    test('a session stopped elsewhere still ends the Pomodoro', () async {
      final controller = await focusing();
      addTearDown(controller.close);
      tracker.stopElsewhere('s1');

      await controller.stop();

      expect(controller.state.isIdle, isTrue);
      expect(store.saved, isNull);
      expect(notifier.scheduledAt, isNull);
    });

    test('stop closes the running session', () async {
      final controller = await focusing();
      addTearDown(controller.close);

      await controller.stop();

      expect(tracker.calls.last, 'stop:s1');
      expect(controller.state.isIdle, isTrue);
    });
  });

  test('a confirmed paused replacement stops it, then starts', () async {
    final controller = build();
    addTearDown(controller.close);
    await tracker.startSession('ws', taskId: 'old');
    await tracker.pauseSession('ws', 's1');
    final paused = (await controller.currentTracking('ws')).paused;

    await controller.startFocus(
      userId: 'u1',
      wsId: 'ws',
      title: 'New',
      taskId: 't1',
      replacingPaused: paused,
    );

    expect(tracker.calls.sublist(2), ['stop:s1', 'start:s2:t1']);
    expect(controller.state.sessionId, 's2');
  });

  group('restore', () {
    test('concurrent restores run once (review 5)', () async {
      store.saved = PomodoroState(
        phase: PomodoroPhase.focus,
        deadline: t0.subtract(const Duration(minutes: 1, seconds: 5)),
        userId: 'u1',
        wsId: 'ws',
        sessionId: 's1',
        taskId: 't1',
      );
      await tracker.startSession('ws', taskId: 't1');
      final controller = build();
      addTearDown(controller.close);

      await Future.wait([controller.restore('u1'), controller.restore('u1')]);

      expect(store.reads, 1);
      expect(tracker.calls.where((c) => c.startsWith('stop')), ['stop:s1']);
    });

    test("another account's Pomodoro is discarded", () async {
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
      expect(tracker.calls, isEmpty);
    });
  });

  testWidgets('the phase ends on its own at the deadline', (tester) async {
    final controller = await focusing();

    now = now.add(const Duration(minutes: 25));
    await tester.pump(const Duration(minutes: 25));
    await tester.pump();

    expect(tracker.calls.last, 'stop:s1');
    expect(controller.state.phase, PomodoroPhase.shortBreak);
    await controller.close();
  });
}
