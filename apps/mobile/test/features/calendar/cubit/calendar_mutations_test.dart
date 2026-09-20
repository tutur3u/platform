import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

void main() {
  late _Repository repository;
  late CalendarCubit cubit;
  const first = CalendarEvent(id: 'first', title: 'Original');
  const second = CalendarEvent(id: 'second', title: 'Second');

  setUpAll(() => registerFallbackValue(DateTime(2026)));
  setUp(() async {
    CalendarCubit.clearCache();
    await CacheStore.instance.clearScope();
    repository = _Repository();
    cubit = CalendarCubit(calendarRepository: repository);
    when(
      () => repository.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async => [first, second]);
    await cubit.loadEvents('origin', forceRefresh: true);
  });
  tearDown(() => cubit.close());

  test('late create updates only the originating workspace cache', () async {
    final response = Completer<CalendarEvent>();
    when(
      () => repository.createEvent('origin', any()),
    ).thenAnswer((_) => response.future);
    final pending = cubit.createEvent(
      'origin',
      title: 'Created',
      startAt: DateTime(2026),
      endAt: DateTime(2026, 1, 1, 1),
    );
    await cubit.loadEvents('other', forceRefresh: true);
    response.complete(const CalendarEvent(id: 'created', title: 'Created'));
    await pending;
    expect(cubit.state.events.map((event) => event.id), ['first', 'second']);
    expect(
      CalendarCubit.cachedStateForWorkspace('origin')!.events.last.id,
      'created',
    );
    expect(CalendarCubit.cachedStateForWorkspace('other')!.events.length, 2);
  });

  test(
    'late pagination cannot append events to a different workspace',
    () async {
      final response = Completer<List<CalendarEvent>>();
      when(
        () => repository.getEvents(
          'origin',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) => response.future);
      final pending = cubit.loadMoreForward('origin');
      await cubit.loadEvents('other', forceRefresh: true);
      response.complete([const CalendarEvent(id: 'private', title: 'Private')]);
      await pending;
      expect(cubit.state.events.map((event) => event.id), ['first', 'second']);
      expect(CalendarCubit.cachedStateForWorkspace('other')!.events.length, 2);
      expect(cubit.state.isLoadingMore, isFalse);
    },
  );

  for (final clearCache in [false, true]) {
    test('replacement cubit protects cache (reset: $clearCache)', () async {
      final response = Completer<void>();
      when(
        () => repository.updateEvent('origin', 'first', any()),
      ).thenAnswer((_) => response.future);
      final pending = cubit.updateEvent('origin', 'first', title: 'Pending');
      await cubit.close();
      if (clearCache) CalendarCubit.clearCache();
      final replacement = CalendarCubit(calendarRepository: repository);
      addTearDown(replacement.close);
      when(
        () => repository.getEvents(
          'origin',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) async => [first.copyWith(title: 'Replacement')]);
      await replacement.loadEvents('origin', forceRefresh: true);
      if (clearCache) {
        when(
          () => repository.updateEvent('origin', 'first', any()),
        ).thenAnswer((_) async {});
        await replacement.updateEvent('origin', 'first', title: 'Replacement');
      }
      response.completeError(
        const ApiException(message: 'Denied', statusCode: 403),
      );
      await pending;
      expect(
        CalendarCubit.cachedStateForWorkspace('origin')!.events.single.title,
        'Replacement',
      );
    });
  }

  for (final deleting in [false, true]) {
    Future<void> startMutation(Completer<void> response) {
      if (deleting) {
        when(
          () => repository.deleteEvent('origin', 'first'),
        ).thenAnswer((_) => response.future);
        return cubit.deleteEvent('origin', 'first');
      }
      when(
        () => repository.updateEvent('origin', 'first', any()),
      ).thenAnswer((_) => response.future);
      return cubit.updateEvent('origin', 'first', title: 'Pending');
    }

    test(
      '${deleting ? "delete" : "update"} rollback stays in its workspace',
      () async {
        final response = Completer<void>();
        final pending = startMutation(response);
        when(
          () => repository.getEvents(
            'other',
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer(
          (_) async => [const CalendarEvent(id: 'other', title: 'Other')],
        );
        await cubit.loadEvents('other', forceRefresh: true);
        response.completeError(
          const ApiException(message: 'Denied', statusCode: 403),
        );
        await pending;
        expect(cubit.state.events.single.id, 'other');
        expect(cubit.state.error, isNull);
        expect(
          CalendarCubit.cachedStateForWorkspace('other')!.events.single.id,
          'other',
        );
        expect(
          CalendarCubit.cachedStateForWorkspace('origin')!.events.first.title,
          'Original',
        );
      },
    );

    test(
      '${deleting ? "delete" : "update"} rollback preserves other edits',
      () async {
        final response = Completer<void>();
        final pending = startMutation(response);
        when(
          () => repository.updateEvent('origin', 'second', any()),
        ).thenAnswer((_) async {});
        await cubit.updateEvent('origin', 'second', title: 'Saved');
        response.completeError(
          const ApiException(message: '  ', statusCode: 500),
        );
        await pending;
        expect(cubit.state.events.first.title, 'Original');
        expect(cubit.state.events.last.title, 'Saved');
        expect(cubit.state.error!.trim(), isNotEmpty);
      },
    );

    test(
      '${deleting ? "delete" : "update"} ignores superseded failure',
      () async {
        final response = Completer<void>();
        final pending = startMutation(response);
        when(
          () => repository.deleteEvent('origin', 'first'),
        ).thenAnswer((_) async {});
        await cubit.deleteEvent('origin', 'first');
        response.completeError(
          const ApiException(message: 'Old failure', statusCode: 500),
        );
        await pending;
        expect(cubit.state.events.map((event) => event.id), ['second']);
        expect(cubit.state.error, isNull);
      },
    );

    test('${deleting ? "delete" : "update"} preserves newer refresh', () async {
      final response = Completer<void>();
      final pending = startMutation(response);
      when(
        () => repository.getEvents(
          'origin',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) async => [first.copyWith(title: 'Server update')]);
      await cubit.loadEvents('origin', forceRefresh: true);
      response.completeError(
        const ApiException(message: 'Old failure', statusCode: 500),
      );
      await pending;
      expect(cubit.state.events.single.title, 'Server update');
      expect(cubit.state.error, isNull);
    });

    test(
      '${deleting ? "delete" : "update"} repairs origin cache after close',
      () async {
        final response = Completer<void>();
        final pending = startMutation(response);
        await cubit.close();
        response.completeError(
          const ApiException(message: 'Denied', statusCode: 403),
        );
        await pending;
        expect(
          CalendarCubit.cachedStateForWorkspace('origin')!.events.first.title,
          'Original',
        );
      },
    );
  }
}
