import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockCalendarRepository extends Mock implements CalendarRepository {}

CalendarEvent _event({required String id, required DateTime startAt}) {
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

    for (final deleting in [false, true]) {
      test(
        'failed ${deleting ? "deletion" : "edit"} restores cached event',
        () async {
          final event = _event(id: 'event', startAt: DateTime(2026, 3, 25));
          when(
            () => repository.getEvents(
              'ws',
              start: any(named: 'start'),
              end: any(named: 'end'),
            ),
          ).thenAnswer((_) async => [event]);
          await cubit.loadEvents('ws', forceRefresh: true);
          if (deleting) {
            when(
              () => repository.deleteEvent('ws', 'event'),
            ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
            await cubit.deleteEvent('ws', 'event');
          } else {
            when(
              () => repository.updateEvent('ws', 'event', any()),
            ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
            await cubit.updateEvent('ws', 'event', title: 'Rejected title');
          }
          expect(cubit.state.events.single.title, event.title);
          expect(cubit.state.error, 'Denied');
          expect(
            CalendarCubit.cachedStateForWorkspace('ws')!.events.single.title,
            event.title,
          );
        },
      );
    }

    test(
      'a previous workspace response cannot replace the active calendar',
      () async {
        final oldResponse = Completer<List<CalendarEvent>>();
        final newResponse = Completer<List<CalendarEvent>>();
        when(
          () => repository.getEvents(
            'old',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) => oldResponse.future);
        when(
          () => repository.getEvents(
            'new',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) => newResponse.future);
        final first = cubit.loadEvents('old', forceRefresh: true);
        await Future<void>.delayed(Duration.zero);
        final second = cubit.loadEvents('new', forceRefresh: true);
        await Future<void>.delayed(Duration.zero);
        newResponse.complete([
          _event(id: 'new', startAt: DateTime(2026, 3, 25)),
        ]);
        await second;
        oldResponse.complete([
          _event(id: 'old', startAt: DateTime(2026, 3, 25)),
        ]);
        await first;
        expect(cubit.state.events.single.id, 'new');
        expect(
          CalendarCubit.cachedStateForWorkspace('new')!.events.single.id,
          'new',
        );
      },
    );

    test(
      'closing Calendar during a refresh does not emit or cache its response',
      () async {
        final response = Completer<List<CalendarEvent>>();
        when(
          () => repository.getEvents(
            'closing',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) => response.future);
        final pending = cubit.loadEvents('closing', forceRefresh: true);
        await Future<void>.delayed(Duration.zero);
        await cubit.close();
        response.complete([_event(id: 'late', startAt: DateTime(2026, 3, 25))]);
        await pending;
        expect(CalendarCubit.cachedStateForWorkspace('closing'), isNull);
      },
    );

    test(
      'a fresh cache does not suppress fetching a newly selected year',
      () async {
        when(
          () => repository.getEvents(
            'ws-1',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) async => []);
        await cubit.loadEvents('ws-1');
        final nextYear = DateTime(DateTime.now().year + 1, 6);
        cubit.selectDate(nextYear);
        await cubit.ensureRangeLoaded('ws-1', nextYear);
        expect(cubit.state.fetchedRange!.start.isBefore(nextYear), isTrue);
        expect(cubit.state.fetchedRange!.end.isAfter(nextYear), isTrue);
        verify(
          () => repository.getEvents(
            'ws-1',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).called(2);
      },
    );

    test('revoked access clears visible and cached events', () async {
      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer(
        (_) async => [_event(id: 'private', startAt: DateTime(2026, 3, 25))],
      );
      await cubit.loadEvents('ws-1');
      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenThrow(const ApiException(statusCode: 403, message: 'Forbidden'));
      await cubit.loadEvents('ws-1', forceRefresh: true);
      expect(cubit.state.events, isEmpty);
      expect(cubit.state.status, CalendarStatus.error);
      expect(CalendarCubit.cachedStateForWorkspace('ws-1'), isNull);
    });

    test('defaults to agenda view', () {
      expect(cubit.state.viewMode, CalendarViewMode.agenda);
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

    test(
      'deduplicates imported copies but keeps distinct event times',
      () async {
        final startAt = DateTime(2026, 3, 25, 9);
        final original = _event(id: 'source-1', startAt: startAt);
        final duplicate = original.copyWith(
          id: 'source-2',
          createdAt: startAt.add(const Duration(minutes: 1)),
        );
        final later = original.copyWith(
          id: 'source-3',
          startAt: startAt.add(const Duration(hours: 2)),
          endAt: startAt.add(const Duration(hours: 3)),
        );
        when(
          () => repository.getEvents(
            'ws-1',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) async => [original, duplicate, later]);

        await cubit.loadEvents('ws-1');

        expect(cubit.state.events.map((event) => event.id), [
          'source-1',
          'source-3',
        ]);
      },
    );

    test('uses target workspace cache after switching workspaces', () async {
      when(
        () => repository.getEvents(
          'ws-2',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer(
        (_) async => [
          _event(id: 'event-ws-2', startAt: DateTime(2026, 3, 26, 10)),
        ],
      );

      await CalendarCubit.prewarm(calendarRepository: repository, wsId: 'ws-2');
      CalendarCubit.clearCache();

      when(
        () => repository.getEvents(
          'ws-1',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer(
        (_) async => [
          _event(id: 'event-ws-1', startAt: DateTime(2026, 3, 25, 9)),
        ],
      );

      await cubit.loadEvents('ws-1');
      expect(cubit.state.events.single.id, 'event-ws-1');

      clearInteractions(repository);

      await cubit.loadEvents('ws-2');

      expect(cubit.state.status, CalendarStatus.loaded);
      expect(cubit.state.isFromCache, isTrue);
      expect(cubit.state.events.single.id, 'event-ws-2');
      verifyNever(
        () => repository.getEvents(
          'ws-2',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      );
    });
  });
}
