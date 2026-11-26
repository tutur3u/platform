import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';

void main() {
  // Monday 23 November 2026.
  final monday = calendarDate(2026, 11, 23, 9);

  test('a new pattern repeats weekly on the start weekday', () {
    final rule = RecurrencePattern.initial(monday).toRule('Asia/Ho_Chi_Minh');
    expect(rule.toJson(), {
      'version': 1,
      'frequency': 'weekly',
      'interval': 1,
      'timeZone': 'Asia/Ho_Chi_Minh',
      'weekdays': ['MO'],
      'end': {'type': 'never'},
    });
  });

  test('an unchanged stored rule serializes as it was read', () {
    final stored = {
      'version': 1,
      'frequency': 'monthly',
      'interval': 2,
      'timeZone': 'Europe/Berlin',
      'monthDay': 31,
      'monthDayOverflow': 'last-day',
      'end': {'type': 'count', 'count': 6},
    };
    final rule = CalendarRecurrenceRule.fromJson(stored);
    expect(rule.toJson(), stored);
    final start = calendarDate(2026, 11, 30, 9);
    expect(
      RecurrencePattern.fromRule(rule, start).toRule('Europe/Berlin'),
      rule,
    );
  });

  test('the first occurrence must match the pattern', () {
    final weekly = RecurrencePattern.initial(monday);
    expect(weekly.isValidFor(monday), isTrue);
    expect(weekly.isValidFor(monday.add(const Duration(days: 1))), isFalse);
    expect(weekly.copyWith(weekdays: []).isValidFor(monday), isFalse);
    expect(weekly.copyWith(interval: 1001).isValidFor(monday), isFalse);
  });

  test('a missing month day may fall back to the last day', () {
    final november30 = calendarDate(2026, 11, 30);
    final monthly = RecurrencePattern.initial(
      november30,
    ).copyWith(frequency: CalendarRecurrenceFrequency.monthly, monthDay: 31);
    expect(monthly.isValidFor(november30), isFalse);
    expect(
      monthly.copyWith(monthDayOverflow: 'last-day').isValidFor(november30),
      isTrue,
    );
  });

  test('relative weekdays match the earliest ordinal date', () {
    // 30 November 2026 is the last Monday of the month.
    final lastMonday = calendarDate(2026, 11, 30, 9);
    final relative = RecurrencePattern.initial(
      lastMonday,
    ).copyWith(frequency: CalendarRecurrenceFrequency.monthly, byWeekday: true);
    expect(relative.weekIndex, -1);
    expect(relative.isValidFor(lastMonday), isTrue);
    expect(relative.copyWith(weekIndex: 4).isValidFor(lastMonday), isFalse);
    expect(relative.toRule('UTC').toJson(), {
      'version': 1,
      'frequency': 'monthly',
      'interval': 1,
      'timeZone': 'UTC',
      'weekdays': ['MO'],
      'weekIndex': -1,
      'end': {'type': 'never'},
    });
  });

  test('a yearly pattern requires the start month', () {
    final yearly = RecurrencePattern.initial(
      monday,
    ).copyWith(frequency: CalendarRecurrenceFrequency.yearly);
    expect(yearly.isValidFor(monday), isTrue);
    expect(yearly.copyWith(month: 1).isValidFor(monday), isFalse);
    expect(yearly.toRule('UTC').month, 11);
  });

  test('an end date before the start is invalid', () {
    final pattern = RecurrencePattern.initial(monday).copyWith(
      endType: CalendarRecurrenceEndType.until,
      until: calendarDate(2026, 11, 22),
    );
    expect(pattern.isValidFor(monday), isFalse);
    expect(
      pattern.copyWith(until: calendarDate(2026, 11, 23)).toRule('UTC').until,
      '2026-11-23',
    );
  });

  test('derived selectors follow a new start date', () {
    final tuesday = monday.add(const Duration(days: 1));
    final moved = RecurrencePattern.initial(
      monday,
    ).followStart(monday, tuesday);
    expect(moved.weekdays, ['TU']);
    expect(moved.monthDay, 24);
    final custom = RecurrencePattern.initial(
      monday,
    ).copyWith(weekdays: ['MO', 'WE']).followStart(monday, tuesday);
    expect(custom.weekdays, ['MO', 'WE']);
  });

  test('a retry of unchanged intent reuses its request id', () {
    var next = 0;
    final identity = RecurrenceRequestIdentity(newId: () => 'id-${next++}');
    expect(identity.idFor(['all', 3, 'Title']), 'id-0');
    expect(identity.idFor(['all', 3, 'Title']), 'id-0');
    expect(identity.idFor(['all', 4, 'Title']), 'id-1');
  });

  test('local strings round-trip through wall-clock carriers', () {
    expect(recurrenceLocalString(monday), '2026-11-23T09:00:00');
    expect(recurrenceLocalWall('2026-11-23T09:00:00'), monday);
  });
}
