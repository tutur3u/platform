import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/classes/cubit/classes_today_cubit.dart';
import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';

import 'classes_today_fakes.dart';

void main() {
  final now = DateTime(2026, 10, 27, 10);

  test('orders in progress, then upcoming, then finished', () {
    final done = session('done', start: DateTime(2026, 10, 27, 7));
    final live = session('live', start: DateTime(2026, 10, 27, 9));
    final later = session('later', start: DateTime(2026, 10, 27, 14));
    final soon = session('soon', start: DateTime(2026, 10, 27, 11));
    expect(
      orderTodaySessions([done, later, live, soon], now).map((s) => s.id),
      ['live', 'soon', 'later', 'done'],
    );
  });

  test('parses API rows and drops cancelled or malformed ones', () {
    final parsed = [
      {
        'id': 's1',
        'groupId': 'g1',
        'groupName': ' IELTS A ',
        'title': '',
        'startsAt': '2026-10-27T01:00:00.000Z',
        'endsAt': '2026-10-27T02:30:00.000Z',
        'status': 'scheduled',
      },
      {
        'id': 's2',
        'groupId': 'g1',
        'startsAt': '2026-10-27T03:00:00.000Z',
        'endsAt': '2026-10-27T04:00:00.000Z',
        'status': 'cancelled',
      },
      {'id': 's3', 'groupId': 'g1', 'startsAt': 'nope'},
    ].map(ClassSession.fromJson).whereType<ClassSession>().toList();
    expect(parsed, hasLength(1));
    expect(parsed.single.groupName, 'IELTS A');
    expect(parsed.single.title, isNull);
  });

  test('a server denial clears the data and the stored snapshot', () async {
    final repository = FakeClassesTodayRepository(allowed: false)
      ..cached = ClassesTodaySnapshot(
        sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
      );
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.denied);
    expect(cubit.state.snapshot, isNull);
    expect(repository.forgotten, ['u1/ec']);
  });

  test('a server error keeps the last data and reports an error', () async {
    final cached = ClassesTodaySnapshot(
      sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
    );
    final repository = FakeClassesTodayRepository()
      ..cached = cached
      ..error = const ApiException(message: 'Boom', statusCode: 500);
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.granted);
    expect(cubit.state.status, ClassesTodayStatus.error);
    expect(cubit.state.snapshot, cached);
    expect(repository.forgotten, isEmpty);
  });

  test('a Turnstile challenge is not an access denial', () async {
    final cached = ClassesTodaySnapshot(
      sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
    );
    final repository = FakeClassesTodayRepository()
      ..cached = cached
      ..error = const ApiException(
        message: 'Verification required',
        statusCode: 403,
        isVerificationRequired: true,
      );
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.granted);
    expect(cubit.state.status, ClassesTodayStatus.error);
    expect(cubit.state.snapshot, cached);
    expect(repository.forgotten, isEmpty);
  });

  // In America/New_York, 2026-11-01 runs 25 hours (clocks fall back at
  // 02:00). Adding 24 h to its midnight lands at 23:00, before 23:30, and
  // used to schedule a negative delay. Run with TZ=America/New_York to
  // exercise the transition; other zones still check the same invariants.
  test('the midnight wake survives a 25-hour fall-back day', () async {
    final lateEvening = DateTime(2026, 11, 1, 23, 30);
    final scheduler = FakeTickScheduler();
    final cubit = ClassesTodayCubit(
      repository: FakeClassesTodayRepository(),
      clock: () => lateEvening,
      scheduler: scheduler.call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    final delay = scheduler.scheduled.last.$1;
    expect(delay, greaterThanOrEqualTo(const Duration(seconds: 1)));
    expect(lateEvening.add(delay), DateTime(2026, 11, 2));
  });

  test('a wake is never shorter than one second', () async {
    final scheduler = FakeTickScheduler();
    final cubit = ClassesTodayCubit(
      repository: FakeClassesTodayRepository(),
      clock: () => DateTime(2026, 10, 27, 23, 59, 59, 999),
      scheduler: scheduler.call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(scheduler.scheduled.last.$1, const Duration(seconds: 1));
  });

  test('a cold server error never claims access', () async {
    final repository = FakeClassesTodayRepository()
      ..error = const ApiException(message: 'Boom', statusCode: 500);
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.unknown);
    expect(cubit.state.status, ClassesTodayStatus.error);
  });

  test(
    'ticks at the next session boundary, then reloads after midnight',
    () async {
      var clock = now;
      final scheduler = FakeTickScheduler();
      final repository = FakeClassesTodayRepository(
        snapshot: ClassesTodaySnapshot(
          sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
        ),
      );
      final cubit = ClassesTodayCubit(
        repository: repository,
        clock: () => clock,
        scheduler: scheduler.call,
      );
      addTearDown(cubit.close);
      await cubit.load(userId: 'u1', wsId: 'ec');
      // 10:00 now; the class starts at 11:00.
      expect(scheduler.scheduled.last.$1, const Duration(hours: 1));
      clock = DateTime(2026, 10, 27, 11);
      scheduler.fireLast();
      expect(cubit.state.tick, 1);
      expect(
        cubit.orderedSessions().single.phaseAt(cubit.now),
        ClassSessionPhase.inProgress,
      );
      // Next wake is the end at 12:30.
      expect(scheduler.scheduled.last.$1, const Duration(minutes: 90));
      clock = DateTime(2026, 10, 27, 12, 30);
      scheduler.fireLast();
      // After the last boundary, the next wake is midnight.
      expect(
        scheduler.scheduled.last.$1,
        const Duration(hours: 11, minutes: 30),
      );
      clock = DateTime(2026, 10, 28, 0, 0, 1);
      repository.snapshot = const ClassesTodaySnapshot(sessions: []);
      scheduler.fireLast();
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetches, hasLength(2));
      expect(cubit.state.snapshot?.sessions, isEmpty);
    },
  );

  test(
    'resuming on a new day reloads even though the timer never fired',
    () async {
      var clock = DateTime(2026, 10, 27, 22);
      final scheduler = FakeTickScheduler();
      final repository = FakeClassesTodayRepository(
        snapshot: ClassesTodaySnapshot(
          sessions: [session('yesterday', start: DateTime(2026, 10, 27, 23))],
        ),
      );
      final cubit = ClassesTodayCubit(
        repository: repository,
        clock: () => clock,
        scheduler: scheduler.call,
      );
      addTearDown(cubit.close);
      await cubit.load(userId: 'u1', wsId: 'ec');
      expect(cubit.state.snapshot?.sessions.single.id, 'yesterday');
      expect(repository.fetches, hasLength(1));
      final armedBeforeSleep = scheduler.scheduled.length;

      // The device sleeps overnight: the monotonic timer is never fired.
      clock = DateTime(2026, 10, 28, 7);
      repository.snapshot = ClassesTodaySnapshot(
        sessions: [session('today', start: DateTime(2026, 10, 28, 9))],
      );
      await cubit.resume();

      expect(repository.fetches, hasLength(2));
      expect(cubit.state.snapshot?.sessions.map((s) => s.id), ['today']);
      expect(scheduler.scheduled.length, greaterThan(armedBeforeSleep));
      // The wake is re-armed from the new day: 09:00 class start is 2 h away.
      expect(scheduler.scheduled.last.$1, const Duration(hours: 2));
    },
  );

  test('resuming on the same day re-renders without a fetch', () async {
    var clock = now;
    final scheduler = FakeTickScheduler();
    final repository = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
      ),
    );
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => clock,
      scheduler: scheduler.call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    clock = DateTime(2026, 10, 27, 11, 30);
    await cubit.resume();
    expect(repository.fetches, hasLength(1));
    expect(cubit.state.tick, 1);
    // Re-armed from the wall clock: the class ends at 12:30.
    expect(scheduler.scheduled.last.$1, const Duration(hours: 1));
  });

  test('resuming with nothing bound does nothing', () async {
    final scheduler = FakeTickScheduler();
    final repository = FakeClassesTodayRepository();
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: scheduler.call,
    );
    addTearDown(cubit.close);
    await cubit.resume();
    expect(repository.fetches, isEmpty);
    expect(scheduler.scheduled, isEmpty);
  });

  test('loads the day and applies "all" until the source can scope', () async {
    final repository = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
      ),
    );
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.granted);
    expect(cubit.state.status, ClassesTodayStatus.ready);
    expect(cubit.state.scope, ClassScope.mine);
    expect(cubit.state.effectiveScope, ClassScope.all);
    expect(repository.fetches, ['u1/ec/mine']);
  });

  test('"show all" refetches only when the source supports scope', () async {
    final repository = FakeClassesTodayRepository(
      snapshot: const ClassesTodaySnapshot(sessions: [], scopeSupported: true),
    );
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.effectiveScope, ClassScope.mine);
    await cubit.setScope(ClassScope.all);
    expect(repository.fetches, ['u1/ec/mine', 'u1/ec/all']);
    expect(cubit.state.effectiveScope, ClassScope.all);
  });

  test('an error keeps the cached snapshot visible', () async {
    final cached = ClassesTodaySnapshot(
      sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
    );
    final repository = FakeClassesTodayRepository()
      ..cached = cached
      ..error = Exception('offline');
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.status, ClassesTodayStatus.error);
    expect(cubit.state.snapshot, cached);
  });

  test('a late result for a previous workspace is dropped', () async {
    final repository = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
      ),
    )..gate = Completer<void>();
    final cubit = ClassesTodayCubit(
      repository: repository,
      clock: () => now,
      scheduler: FakeTickScheduler().call,
    );
    addTearDown(cubit.close);
    final first = cubit.load(userId: 'u1', wsId: 'ec');
    await Future<void>.delayed(Duration.zero);
    final second = cubit.load(userId: null, wsId: null);
    repository.gate!.complete();
    await Future.wait([first, second]);
    expect(cubit.state, const ClassesTodayState());
  });
}
