import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

void main() {
  setUpAll(() => registerFallbackValue(DateTime(2026, 11, 20)));

  test('create and clear send the meeting location', () async {
    CalendarCubit.clearCache();
    await CacheStore.instance.clearScope();
    final repository = _Repository();
    final cubit = CalendarCubit(calendarRepository: repository);
    addTearDown(cubit.close);
    final start = DateTime.utc(2026, 11, 20, 2);
    final stored = CalendarEvent(
      id: 'event',
      title: 'Review',
      location: 'Room A',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
    );
    when(
      () => repository.getEvents(
        'ws',
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async => [stored]);
    await cubit.loadEvents('ws', forceRefresh: true);

    Map<String, dynamic>? created;
    when(() => repository.createEvent('ws', any())).thenAnswer((
      invocation,
    ) async {
      created = invocation.positionalArguments[1] as Map<String, dynamic>;
      return CalendarEvent.fromJson({
        ...created!,
        'id': 'created',
        'ws_id': 'ws',
      });
    });
    await cubit.createEvent(
      'ws',
      title: 'New',
      location: 'Building 2',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
    );
    expect(created!['location'], 'Building 2');
    expect(
      cubit.state.events.singleWhere((event) => event.id == 'created').place,
      'Building 2',
    );

    Map<String, dynamic>? updated;
    when(() => repository.updateEvent('ws', 'event', any())).thenAnswer((
      invocation,
    ) async {
      updated = invocation.positionalArguments[2] as Map<String, dynamic>;
    });
    await cubit.updateEvent('ws', 'event', location: '');
    expect(updated!['location'], '');
    expect(
      cubit.state.events.singleWhere((event) => event.id == 'event').place,
      isNull,
    );
  });
}
