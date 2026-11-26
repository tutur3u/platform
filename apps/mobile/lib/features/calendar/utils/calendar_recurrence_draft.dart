import 'dart:convert';

import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';

/// `YYYY-MM-DDTHH:MM:SS` for a wall-clock carrier.
String recurrenceLocalString(DateTime wall) =>
    wall.toIso8601String().substring(0, 19);

/// The wall-clock carrier for a `YYYY-MM-DDTHH:MM(:SS)` local value.
DateTime recurrenceLocalWall(String local) {
  final parsed = DateTime.parse(local);
  return calendarDate(
    parsed.year,
    parsed.month,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  );
}

int _daysInMonth(DateTime date) =>
    DateTime.utc(date.year, date.month + 1, 0).day;

int _weekIndexOf(DateTime date) {
  final index = (date.day / 7).ceil();
  return index > 4 ? -1 : index;
}

/// The editable recurrence pattern, without the event or its anchor.
class RecurrencePattern {
  const RecurrencePattern({
    required this.frequency,
    required this.interval,
    required this.weekdays,
    required this.byWeekday,
    required this.monthDay,
    required this.weekIndex,
    required this.month,
    required this.endType,
    this.weekStartsOn,
    this.monthDayOverflow = 'skip',
    this.count = 10,
    this.until,
  });

  /// Weekly on the start weekday, matching the web default.
  factory RecurrencePattern.initial(DateTime start) => RecurrencePattern(
    frequency: CalendarRecurrenceFrequency.weekly,
    interval: 1,
    weekdays: [calendarRecurrenceWeekdays[start.weekday - 1]],
    byWeekday: false,
    monthDay: start.day,
    weekIndex: _weekIndexOf(start),
    month: start.month,
    endType: CalendarRecurrenceEndType.never,
  );

  factory RecurrencePattern.fromRule(
    CalendarRecurrenceRule rule,
    DateTime start,
  ) => RecurrencePattern(
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.weekdays ?? [calendarRecurrenceWeekdays[start.weekday - 1]],
    byWeekday: rule.weekIndex != null,
    monthDay: rule.monthDay ?? start.day,
    weekIndex: rule.weekIndex ?? _weekIndexOf(start),
    month: rule.month ?? start.month,
    weekStartsOn: rule.weekStartsOn,
    monthDayOverflow: rule.monthDayOverflow ?? 'skip',
    endType: rule.endType,
    count: rule.count ?? 10,
    until: rule.until == null ? null : recurrenceLocalWall(rule.until!),
  );

  final CalendarRecurrenceFrequency frequency;
  final int interval;
  final List<String> weekdays;

  /// Monthly and yearly patterns repeat by ordinal weekday instead of date.
  final bool byWeekday;
  final int monthDay;
  final int weekIndex;
  final int month;
  final String? weekStartsOn;
  final String monthDayOverflow;
  final CalendarRecurrenceEndType endType;
  final int count;

  /// Inclusive end date as a wall-clock carrier.
  final DateTime? until;

  bool get _monthly =>
      frequency == CalendarRecurrenceFrequency.monthly ||
      frequency == CalendarRecurrenceFrequency.yearly;

  bool get usesWeekdays =>
      frequency == CalendarRecurrenceFrequency.weekly ||
      (_monthly && byWeekday);

  RecurrencePattern copyWith({
    CalendarRecurrenceFrequency? frequency,
    int? interval,
    List<String>? weekdays,
    bool? byWeekday,
    int? monthDay,
    int? weekIndex,
    int? month,
    String? monthDayOverflow,
    CalendarRecurrenceEndType? endType,
    int? count,
    DateTime? until,
  }) => RecurrencePattern(
    frequency: frequency ?? this.frequency,
    interval: interval ?? this.interval,
    weekdays: weekdays ?? this.weekdays,
    byWeekday: byWeekday ?? this.byWeekday,
    monthDay: monthDay ?? this.monthDay,
    weekIndex: weekIndex ?? this.weekIndex,
    month: month ?? this.month,
    weekStartsOn: weekStartsOn,
    monthDayOverflow: monthDayOverflow ?? this.monthDayOverflow,
    endType: endType ?? this.endType,
    count: count ?? this.count,
    until: until ?? this.until,
  );

  /// Selectors derived from the old start move with a new start date.
  RecurrencePattern followStart(DateTime previous, DateTime next) {
    final previousDay = calendarRecurrenceWeekdays[previous.weekday - 1];
    return copyWith(
      weekdays: weekdays.length == 1 && weekdays.single == previousDay
          ? [calendarRecurrenceWeekdays[next.weekday - 1]]
          : null,
      monthDay: monthDay == previous.day ? next.day : null,
      weekIndex: weekIndex == _weekIndexOf(previous)
          ? _weekIndexOf(next)
          : null,
      month: month == previous.month ? next.month : null,
    );
  }

  CalendarRecurrenceRule toRule(String timeZone) => CalendarRecurrenceRule(
    frequency: frequency,
    interval: interval,
    timeZone: timeZone,
    weekStartsOn: frequency == CalendarRecurrenceFrequency.weekly
        ? weekStartsOn
        : null,
    weekdays: usesWeekdays
        ? [
            for (final day in calendarRecurrenceWeekdays)
              if (weekdays.contains(day)) day,
          ]
        : null,
    monthDay: _monthly && !byWeekday ? monthDay : null,
    monthDayOverflow: _monthly && !byWeekday ? monthDayOverflow : null,
    weekIndex: _monthly && byWeekday ? weekIndex : null,
    month: frequency == CalendarRecurrenceFrequency.yearly ? month : null,
    endType: endType,
    count: endType == CalendarRecurrenceEndType.count ? count : null,
    until: endType == CalendarRecurrenceEndType.until && until != null
        ? recurrenceLocalString(until!).substring(0, 10)
        : null,
  );

  /// Whether a series starting at [start] is valid, mirroring the server's
  /// bounds and its rule that the first occurrence matches the pattern.
  bool isValidFor(DateTime start) {
    if (interval < 1 || interval > 1000) return false;
    if (usesWeekdays && weekdays.isEmpty) return false;
    if (_monthly && !byWeekday && (monthDay < 1 || monthDay > 31)) {
      return false;
    }
    if (endType == CalendarRecurrenceEndType.count &&
        (count < 1 || count > 10000)) {
      return false;
    }
    if (endType == CalendarRecurrenceEndType.until) {
      final end = until;
      if (end == null) return false;
      if (end.isBefore(calendarDate(start.year, start.month, start.day))) {
        return false;
      }
    }
    final day = calendarRecurrenceWeekdays[start.weekday - 1];
    return switch (frequency) {
      CalendarRecurrenceFrequency.daily => true,
      CalendarRecurrenceFrequency.weekly => weekdays.contains(day),
      _
          when frequency == CalendarRecurrenceFrequency.yearly &&
              month != start.month =>
        false,
      _ when !byWeekday =>
        start.day ==
            (monthDayOverflow == 'last-day'
                ? (monthDay < _daysInMonth(start)
                      ? monthDay
                      : _daysInMonth(start))
                : monthDay),
      _ => start.day == _earliestOrdinalDay(start),
    };
  }

  /// Relative patterns select the earliest matching ordinal weekday.
  int _earliestOrdinalDay(DateTime date) {
    final first = DateTime.utc(date.year, date.month);
    final last = _daysInMonth(date);
    final lastWeekday = DateTime.utc(date.year, date.month, last).weekday;
    var earliest = 99;
    for (final code in weekdays) {
      final index = calendarRecurrenceWeekdays.indexOf(code) + 1;
      final candidate = weekIndex == -1
          ? last - ((lastWeekday - index + 7) % 7)
          : 1 + ((index - first.weekday + 7) % 7) + (weekIndex - 1) * 7;
      if (candidate < earliest) earliest = candidate;
    }
    return earliest;
  }
}

/// A retry of unchanged intent reuses its request id, so a lost response can
/// be retried without a duplicate write; any change of intent gets a new id.
class RecurrenceRequestIdentity {
  RecurrenceRequestIdentity({String Function()? newId})
    : _newId = newId ?? newLocalMutationId;

  final String Function() _newId;
  String? _intent;
  String? _id;

  String idFor(Object? intent) {
    final next = jsonEncode(intent);
    if (next != _intent || _id == null) {
      _intent = next;
      _id = _newId();
    }
    return _id!;
  }
}
