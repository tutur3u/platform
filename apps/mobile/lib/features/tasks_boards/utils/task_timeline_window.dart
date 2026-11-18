import 'package:flutter/foundation.dart' show immutable;

/// How many days the board timeline shows at once.
enum TaskTimelineSpan {
  /// Seven days, Monday first.
  week,

  /// Fourteen days, Monday first.
  twoWeeks,

  /// One calendar month.
  month,
}

/// The run of calendar days the board timeline lays out as columns.
///
/// Days are plain local-date `DateTime`s (midnight, no zone): the caller
/// resolves "today" in the user's timezone setting first.
@immutable
class TaskTimelineWindow {
  const TaskTimelineWindow._(this.span, this.start, this.days);

  /// The window of [span] holding [day]: the Monday-first week or two weeks,
  /// or the calendar month.
  factory TaskTimelineWindow.around(TaskTimelineSpan span, DateTime day) {
    final date = DateTime(day.year, day.month, day.day);
    return switch (span) {
      TaskTimelineSpan.week => TaskTimelineWindow._(
        span,
        _monday(date),
        DateTime.daysPerWeek,
      ),
      TaskTimelineSpan.twoWeeks => TaskTimelineWindow._(
        span,
        _monday(date),
        DateTime.daysPerWeek * 2,
      ),
      TaskTimelineSpan.month => TaskTimelineWindow._(
        span,
        DateTime(date.year, date.month),
        _daysInMonth(date.year, date.month),
      ),
    };
  }

  /// A window of [span]'s length whose middle column is [day].
  factory TaskTimelineWindow.centredOn(TaskTimelineSpan span, DateTime day) {
    final length = TaskTimelineWindow.around(span, day).days;
    return TaskTimelineWindow._(
      span,
      DateTime(day.year, day.month, day.day - length ~/ 2),
      length,
    );
  }

  final TaskTimelineSpan span;

  /// The first column's day.
  final DateTime start;

  /// Column count.
  final int days;

  /// The last column's day.
  DateTime get end => dayAt(days - 1);

  /// The day of column [index].
  DateTime dayAt(int index) =>
      DateTime(start.year, start.month, start.day + index);

  /// The column of [day]; negative before the window, `>= days` after it.
  int columnOf(DateTime day) => daysBetween(start, day);

  bool contains(DateTime day) {
    final column = columnOf(day);
    return column >= 0 && column < days;
  }

  /// The neighbouring window [steps] spans away: a whole month for month
  /// windows that start on the 1st, otherwise the window's own length.
  TaskTimelineWindow shift(int steps) {
    if (span == TaskTimelineSpan.month && start.day == 1) {
      final first = DateTime(start.year, start.month + steps);
      return TaskTimelineWindow._(
        span,
        first,
        _daysInMonth(first.year, first.month),
      );
    }
    return TaskTimelineWindow._(
      span,
      DateTime(start.year, start.month, start.day + days * steps),
      days,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is TaskTimelineWindow &&
      other.span == span &&
      other.start == start &&
      other.days == days;

  @override
  int get hashCode => Object.hash(span, start, days);
}

/// Calendar days from [from] to [to], ignoring daylight-saving hour shifts.
int daysBetween(DateTime from, DateTime to) => DateTime.utc(
  to.year,
  to.month,
  to.day,
).difference(DateTime.utc(from.year, from.month, from.day)).inDays;

DateTime _monday(DateTime day) =>
    DateTime(day.year, day.month, day.day - (day.weekday - DateTime.monday));

int _daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;
