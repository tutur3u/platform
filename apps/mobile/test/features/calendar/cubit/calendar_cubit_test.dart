import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockCalendarRepository extends Mock implements CalendarRepository {}

CalendarEvent _event({
  required String id,
  required DateTime startAt,
}) {
  return CalendarEvent(
    id: id,
    title: 'Event $id',
    description: 'Description $id',
    startAt: startAt,
    endAt: startAt.add(const Duration(hours: 1)),
    color: '#00AAFF',
    createdAt: startAt,
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(DateTime(2026, 3, 25));
  });

  group('CalendarCubit cache', () {
    late _MockCalendarRepository repository;
    late CalendarCubit cubit;

    setUp(() async {
      CalendarCubit.clearCache();
      await CacheStore.instance.clearScope();
      repository = _MockCalendarRepository();
      cubit = CalendarCubit(calendarRepository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    test('reuses fresh cached state across cubit instances', () async {
      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer(
        (_) async => [_event(id: 'event-1', startAt: DateTime(2026, 3, 25, 9))],
      );

      await cubit.loadEvents('ws-1');
      await cubit.close();

      final cachedCubit = CalendarCubit(
        calendarRepository: repository,
        initialState: CalendarCubit.cachedStateForWorkspace('ws-1'),
      );
      addTearDown(cachedCubit.close);

      await cachedCubit.loadEvents('ws-1');

      expect(cachedCubit.state.status, CalendarStatus.loaded);
      expect(cachedCubit.state.events, hasLength(1));
      verify(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);
    });

    test('force refresh keeps visible data while revalidating', () async {
      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer(
        (_) async => [_event(id: 'event-1', startAt: DateTime(2026, 3, 25, 9))],
      );

      await cubit.loadEvents('ws-1');
      await cubit.close();

      final refreshCompleter = Completer<List<CalendarEvent>>();
      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) => refreshCompleter.future);

      final cachedCubit = CalendarCubit(
        calendarRepository: repository,
        initialState: CalendarCubit.cachedStateForWorkspace('ws-1'),
      );
      addTearDown(cachedCubit.close);

      final future = cachedCubit.loadEvents('ws-1', forceRefresh: true);

      expect(cachedCubit.state.status, CalendarStatus.loading);
      expect(cachedCubit.state.events, hasLength(1));
      expect(cachedCubit.state.hasLoadedOnce, isTrue);

      refreshCompleter.complete([
        _event(id: 'event-2', startAt: DateTime(2026, 3, 26, 10)),
      ]);
      await future;

      expect(cachedCubit.state.status, CalendarStatus.loaded);
      expect(cachedCubit.state.events.single.id, 'event-2');
    });
  });
}
