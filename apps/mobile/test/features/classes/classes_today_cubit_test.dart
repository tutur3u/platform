import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
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

  test('a member without view_user_groups gets no data and no fetch', () async {
    final repository = FakeClassesTodayRepository(allowed: false);
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
    addTearDown(cubit.close);
    await cubit.load(userId: 'u1', wsId: 'ec');
    expect(cubit.state.access, ClassesTodayAccess.denied);
    expect(cubit.state.snapshot, isNull);
    expect(repository.fetches, isEmpty);
  });

  test('loads the day and applies "all" until the source can scope', () async {
    final repository = FakeClassesTodayRepository(
      snapshot: ClassesTodaySnapshot(
        sessions: [session('a', start: DateTime(2026, 10, 27, 11))],
      ),
    );
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
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
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
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
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
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
    final cubit = ClassesTodayCubit(repository: repository, clock: () => now);
    addTearDown(cubit.close);
    final first = cubit.load(userId: 'u1', wsId: 'ec');
    await Future<void>.delayed(Duration.zero);
    final second = cubit.load(userId: null, wsId: null);
    repository.gate!.complete();
    await Future.wait([first, second]);
    expect(cubit.state, const ClassesTodayState());
  });
}
