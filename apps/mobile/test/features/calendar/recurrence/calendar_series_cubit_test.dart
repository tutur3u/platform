import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/repositories/calendar_series_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_series_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarSeriesRepository {}

CalendarSeriesOccurrence occurrence(String id) => CalendarSeriesOccurrence(
  event: CalendarEvent(id: id, title: 'Synthetic'),
  seriesId: 'series',
  seriesRevision: 2,
  originalStartLocal: '2026-11-23T09:00:00',
  rule: const CalendarRecurrenceRule(
    frequency: CalendarRecurrenceFrequency.daily,
    timeZone: 'UTC',
  ),
);

void main() {
  late _Repository repository;
  late CalendarSeriesCubit cubit;
  setUpAll(() => registerFallbackValue(DateTime.utc(2026)));
  setUp(() {
    repository = _Repository();
    when(() => repository.dispose()).thenReturn(null);
    cubit = CalendarSeriesCubit(
      repository: repository,
      currentUserId: () => 'reader',
    );
  });
  tearDown(() => cubit.close());

  test('splits long ranges into reads of at most 400 days', () async {
    final ranges = <(DateTime, DateTime)>[];
    when(
      () => repository.listOccurrences(
        'ws',
        from: any(named: 'from'),
        to: any(named: 'to'),
      ),
    ).thenAnswer((invocation) async {
      final from = invocation.namedArguments[#from] as DateTime;
      ranges.add((from, invocation.namedArguments[#to] as DateTime));
      return [occurrence('o-${ranges.length}'), occurrence('o-1')];
    });
    final start = DateTime.utc(2026);
    await cubit.load(
      'ws',
      DateTimeRange(start: start, end: DateTime.utc(2027, 6)),
    );
    expect(ranges, hasLength(2));
    for (final (from, to) in ranges) {
      expect(to.difference(from).inDays, lessThanOrEqualTo(400));
    }
    expect(ranges.last.$2, DateTime.utc(2027, 6));
    expect(cubit.state.occurrences.map((o) => o.event.id), ['o-1', 'o-2']);
    expect(cubit.occurrenceFor('o-2'), isNotNull);
    final events = [const CalendarEvent(id: 'plain')];
    final merged = cubit.mergeInto(events);
    expect(merged.map((e) => e.id), ['plain', 'o-1', 'o-2']);
    expect(identical(cubit.mergeInto(events), merged), isTrue);
  });

  test('denial clears occurrences; offline keeps them', () async {
    var failure = const ApiException.transport(message: 'Offline');
    var fail = false;
    when(
      () => repository.listOccurrences(
        'ws',
        from: any(named: 'from'),
        to: any(named: 'to'),
      ),
    ).thenAnswer((_) async {
      if (fail) throw failure;
      return [occurrence('o-1')];
    });
    final range = DateTimeRange(
      start: DateTime.utc(2026, 11),
      end: DateTime.utc(2026, 12),
    );
    await cubit.load('ws', range);
    fail = true;
    await cubit.reload();
    expect(cubit.state.loadFailure, CalendarSeriesFailure.offline);
    expect(cubit.state.occurrences, hasLength(1));
    failure = const ApiException(message: 'Denied', statusCode: 403);
    await cubit.reload();
    expect(cubit.state.loadFailure, CalendarSeriesFailure.denied);
    expect(cubit.state.occurrences, isEmpty);
  });

  test('maps write failures to the shown reasons', () {
    expect(
      calendarSeriesFailureOf(
        const ApiException(message: 'Changed', statusCode: 409),
      ),
      CalendarSeriesFailure.conflict,
    );
    expect(
      calendarSeriesFailureOf(
        const ApiException(message: 'Denied', statusCode: 403),
      ),
      CalendarSeriesFailure.denied,
    );
    expect(
      calendarSeriesFailureOf(
        const ApiException(message: 'Bad', statusCode: 400),
      ),
      CalendarSeriesFailure.invalid,
    );
    expect(
      calendarSeriesFailureOf(
        const ApiException(message: 'Gone', statusCode: 404),
      ),
      CalendarSeriesFailure.unavailable,
    );
    expect(
      calendarSeriesFailureOf(const ApiException.transport(message: 'Off')),
      CalendarSeriesFailure.offline,
    );
  });
}
