import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';

void main() {
  test('preserves model UTC instants and unrelated scheduling metadata', () {
    final event = CalendarEvent.fromJson(const {
      'id': 'event',
      'start_at': '2026-10-05T00:30:00Z',
      'end_at': '2026-10-05T01:30:00Z',
      'scheduling_metadata': {'provider_data': 'retained'},
    });
    expect(event.startAt, DateTime.utc(2026, 10, 5, 0, 30));
    expect(event.startAt!.isUtc, isTrue);
    final projected = calendarProjectEvent(event, 'America/Los_Angeles');
    expect(projected.startAt, calendarDate(2026, 10, 4, 17, 30));
    expect(event.toJson()['start_at'], '2026-10-05T00:30:00.000Z');
    expect(event.toJson()['scheduling_metadata'], {
      'provider_data': 'retained',
    });
  });
  for (final sample in [(3, 8, 23), (11, 1, 25)]) {
    test('New York calendar midnight span lasts ${sample.$3} hours', () {
      final start = calendarWallToUtc(
        calendarDate(2026, sample.$1, sample.$2),
        'America/New_York',
      );
      final end = calendarWallToUtc(
        calendarDate(2026, sample.$1, sample.$2 + 1),
        'America/New_York',
      );
      expect(end.difference(start).inHours, sample.$3);
      final event = CalendarEvent.fromJson({
        'id': 'day',
        'start_at': start.toIso8601String(),
        'end_at': end.toIso8601String(),
      });
      final displayed = calendarProjectEvent(event, 'America/New_York');
      expect(displayed.isAllDay, isTrue);
      expect(displayed.startAt, calendarDate(2026, sample.$1, sample.$2));
      expect(displayed.endAt, calendarDate(2026, sample.$1, sample.$2 + 1));
    });
  }
  test('date-only legacy UTC rows keep their existing date contract', () {
    final event = CalendarEvent.fromJson(const {
      'id': 'legacy',
      'start_at': '2026-10-05T00:00:00Z',
      'end_at': '2026-10-06T00:00:00Z',
    });
    final displayed = calendarProjectEvent(event, 'America/Los_Angeles');
    expect(displayed.startAt, calendarDate(2026, 10, 5));
    expect(displayed.endAt, calendarDate(2026, 10, 6));
    expect(event.startAt, DateTime.utc(2026, 10, 5));
  });
  test('midnight-crossing instant overlaps both configured calendar dates', () {
    final event = CalendarEvent.fromJson(const {
      'id': 'crossing',
      'start_at': '2026-10-05T06:30:00Z',
      'end_at': '2026-10-05T08:30:00Z',
    });
    for (final day in [4, 5]) {
      final state = CalendarState(
        timezone: 'America/Los_Angeles',
        selectedDate: calendarDate(2026, 10, day),
        events: [event],
      );
      expect(state.selectedDateEvents.single.id, 'crossing');
    }
  });
  test('rejects nonexistent spring-forward wall time', () {
    expect(
      () => calendarWallToUtc(
        calendarDate(2026, 3, 8, 2, 30),
        'America/New_York',
      ),
      throwsFormatException,
    );
  });
  final nativeNewYork =
      DateTime(2026).timeZoneOffset == const Duration(hours: -5) &&
      DateTime(2026, 7).timeZoneOffset == const Duration(hours: -4);
  test('device fallback rejects native New York DST normalization', () {
    expect(
      nativeNewYork,
      isTrue,
      reason: 'The subprocess must use real New York native time',
    );
    final wall = calendarDate(2026, 3, 8, 2, 30, 45, 123, 456);
    final native = DateTime(2026, 3, 8, 2, 30, 45, 123, 456);
    expect(
      native.hour,
      isNot(wall.hour),
      reason: 'The real device constructor normalizes the DST gap',
    );
    expect(() => calendarWallToUtc(wall, null), throwsFormatException);
    final valid = calendarDate(2026, 3, 8, 3, 30, 45, 123, 456);
    expect(
      calendarWallToUtc(valid, null),
      DateTime.utc(2026, 3, 8, 7, 30, 45, 123, 456),
    );
  }, skip: !nativeNewYork && Platform.environment['TZ'] != 'America/New_York');
}
