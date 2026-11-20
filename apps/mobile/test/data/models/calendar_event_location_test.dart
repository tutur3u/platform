import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_event_deduplication.dart';
import 'package:mobile/features/calendar/utils/calendar_location.dart';

void main() {
  test('parses, trims, and round-trips a meeting location', () {
    final event = CalendarEvent.fromJson(const <String, dynamic>{
      'id': 'event',
      'title': 'Review',
      'location': '  Conference Room A  ',
      'start_at': '2026-11-20T02:00:00Z',
      'end_at': '2026-11-20T03:00:00Z',
    });

    expect(event.place, 'Conference Room A');
    expect(event.toJson()['location'], 'Conference Room A');
    expect(CalendarEvent.fromJson(event.toJson()).place, 'Conference Room A');
  });

  test('blank and missing locations stay absent', () {
    for (final location in [null, '', '   ', 12]) {
      final event = CalendarEvent.fromJson({
        'id': 'event',
        'location': location,
        'start_at': '2026-11-20T02:00:00Z',
        'end_at': '2026-11-20T03:00:00Z',
      });
      expect(event.location, isNull);
      expect(event.place, isNull);
      expect(calendarLocationMapUri(event.place), isNull);
    }
  });

  test('maps query uses the trimmed place', () {
    expect(
      calendarLocationMapUri('  Room 4 '),
      Uri.parse('https://www.google.com/maps/search/?api=1&query=Room+4'),
    );
  });

  test('dedup keeps events that differ only by place', () {
    final start = DateTime.utc(2026, 11, 20, 2);
    final room = CalendarEvent(
      id: 'room',
      title: 'Review',
      location: 'Room A',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
    );
    final otherRoom = room.copyWith(id: 'other', location: 'Room B');
    final copy = room.copyWith(id: 'copy');

    expect(
      deduplicateCalendarEvents([
        room,
        copy,
        otherRoom,
      ]).map((event) => event.id),
      ['room', 'other'],
    );
  });
}
