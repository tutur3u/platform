import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';

void main() {
  test('copyWith preserves, replaces and clears all-day override', () {
    const event = CalendarEvent(id: 'event', isAllDayOverride: true);
    expect(event.copyWith(title: 'edited').isAllDayOverride, isTrue);
    expect(event.copyWith(isAllDayOverride: false).isAllDayOverride, isFalse);
    expect(event.copyWith(isAllDayOverride: null).isAllDayOverride, isNull);
  });
}
