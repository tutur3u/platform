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
