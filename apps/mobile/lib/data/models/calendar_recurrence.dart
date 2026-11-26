import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/calendar_event.dart';

/// Weekday codes of the canonical native Calendar recurrence rule.
const calendarRecurrenceWeekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

enum CalendarRecurrenceFrequency { daily, weekly, monthly, yearly }

enum CalendarRecurrenceEndType { never, count, until }

/// Edit and delete targets shared with the web recurrence dialog.
enum CalendarRecurrenceScope {
  occurrence('this'),
  future('future'),
  series('all');

  const CalendarRecurrenceScope(this.wire);
  final String wire;
}

/// The canonical version 1 rule. Optional selectors stay absent when unset so
/// an unchanged rule serializes exactly as the server stored it.
class CalendarRecurrenceRule extends Equatable {
  const CalendarRecurrenceRule({
    required this.frequency,
    required this.timeZone,
    this.interval = 1,
    this.weekStartsOn,
    this.weekdays,
    this.monthDay,
    this.monthDayOverflow,
    this.weekIndex,
    this.month,
    this.endType = CalendarRecurrenceEndType.never,
    this.count,
    this.until,
  });

  factory CalendarRecurrenceRule.fromJson(Map<String, dynamic> json) {
    final end = json['end'] is Map
        ? Map<String, dynamic>.from(json['end'] as Map)
        : const <String, dynamic>{};
    return CalendarRecurrenceRule(
      frequency: CalendarRecurrenceFrequency.values.byName(
        json['frequency'] as String,
      ),
      interval: (json['interval'] as num?)?.toInt() ?? 1,
      timeZone: json['timeZone'] as String,
      weekStartsOn: json['weekStartsOn'] as String?,
      weekdays: (json['weekdays'] as List<Object?>?)
          ?.whereType<String>()
          .toList(growable: false),
      monthDay: (json['monthDay'] as num?)?.toInt(),
      monthDayOverflow: json['monthDayOverflow'] as String?,
      weekIndex: (json['weekIndex'] as num?)?.toInt(),
      month: (json['month'] as num?)?.toInt(),
      endType: CalendarRecurrenceEndType.values.byName(
        end['type'] as String? ?? 'never',
      ),
      count: (end['count'] as num?)?.toInt(),
      until: end['date'] as String?,
    );
  }

  final CalendarRecurrenceFrequency frequency;
  final int interval;
  final String timeZone;
  final String? weekStartsOn;
  final List<String>? weekdays;
  final int? monthDay;

  /// `skip` or `last-day`; only meaningful with [monthDay].
  final String? monthDayOverflow;

  /// 1-4, or -1 for the last matching weekday of the month.
  final int? weekIndex;
  final int? month;
  final CalendarRecurrenceEndType endType;
  final int? count;

  /// Inclusive local end date, `YYYY-MM-DD`.
  final String? until;

  Map<String, dynamic> toJson() => {
    'version': 1,
    'frequency': frequency.name,
    'interval': interval,
    'timeZone': timeZone,
    if (weekStartsOn != null) 'weekStartsOn': weekStartsOn,
    if (weekdays != null) 'weekdays': weekdays,
    if (monthDay != null) 'monthDay': monthDay,
    if (monthDayOverflow != null) 'monthDayOverflow': monthDayOverflow,
    if (weekIndex != null) 'weekIndex': weekIndex,
    if (month != null) 'month': month,
    'end': switch (endType) {
      CalendarRecurrenceEndType.never => {'type': 'never'},
      CalendarRecurrenceEndType.count => {'type': 'count', 'count': count},
      CalendarRecurrenceEndType.until => {'type': 'until', 'date': until},
    },
  };

  @override
  List<Object?> get props => [
    frequency,
    interval,
    timeZone,
    weekStartsOn,
    weekdays,
    monthDay,
    monthDayOverflow,
    weekIndex,
    month,
    endType,
    count,
    until,
  ];
}

/// Local wall-clock bounds in the rule time zone, `YYYY-MM-DDTHH:MM:SS`.
class CalendarRecurrenceAnchor extends Equatable {
  const CalendarRecurrenceAnchor({
    required this.startLocal,
    required this.endLocal,
    required this.allDay,
  });

  factory CalendarRecurrenceAnchor.fromJson(Map<String, dynamic> json) =>
      CalendarRecurrenceAnchor(
        startLocal: json['startLocal'] as String,
        endLocal: json['endLocal'] as String,
        allDay: json['allDay'] == true,
      );

  final String startLocal;
  final String endLocal;
  final bool allDay;

  Map<String, dynamic> toJson() => {
    'startLocal': startLocal,
    'endLocal': endLocal,
    'allDay': allDay,
  };

  @override
  List<Object?> get props => [startLocal, endLocal, allDay];
}

class NativeCalendarSeries extends Equatable {
  const NativeCalendarSeries({
    required this.id,
    required this.revision,
    required this.rule,
    required this.anchor,
    this.title = '',
    this.description = '',
    this.location,
    this.color,
    this.isProviderSeries = false,
  });

  factory NativeCalendarSeries.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'] is Map
        ? Map<String, dynamic>.from(json['payload'] as Map)
        : const <String, dynamic>{};
    return NativeCalendarSeries(
      id: json['id'] as String,
      revision: (json['revision'] as num).toInt(),
      rule: CalendarRecurrenceRule.fromJson(
        Map<String, dynamic>.from(json['rule'] as Map),
      ),
      anchor: CalendarRecurrenceAnchor.fromJson(
        Map<String, dynamic>.from(json['anchor'] as Map),
      ),
      title: payload['title'] as String? ?? '',
      description: payload['description'] as String? ?? '',
      location: payload['location'] as String?,
      color: payload['color'] as String?,
      isProviderSeries: json['providerSource'] is Map,
    );
  }

  final String id;
  final int revision;
  final CalendarRecurrenceRule rule;
  final CalendarRecurrenceAnchor anchor;
  final String title;
  final String description;
  final String? location;
  final String? color;

  /// Provider-backed series are published through retained provider
  /// operations, which this client does not drive.
  final bool isProviderSeries;

  @override
  List<Object?> get props => [id, revision, rule, anchor, title, location];
}

/// A virtual occurrence of a native series. It is never an ordinary event row
/// and must only change through series operations.
class CalendarSeriesOccurrence extends Equatable {
  const CalendarSeriesOccurrence({
    required this.event,
    required this.seriesId,
    required this.seriesRevision,
    required this.originalStartLocal,
    required this.rule,
    this.isException = false,
    this.isProviderSeries = false,
  });

  factory CalendarSeriesOccurrence.fromJson(Map<String, dynamic> json) =>
      CalendarSeriesOccurrence(
        event: CalendarEvent.fromJson(json).copyWith(
          isAllDayOverride: json['is_all_day'] is bool
              ? json['is_all_day'] as bool
              : null,
        ),
        seriesId: json['seriesId'] as String,
        seriesRevision: (json['seriesRevision'] as num).toInt(),
        originalStartLocal: json['originalStartLocal'] as String,
        rule: CalendarRecurrenceRule.fromJson(
          Map<String, dynamic>.from(json['recurrence'] as Map),
        ),
        isException: json['isException'] == true,
        isProviderSeries: json['providerSource'] is Map,
      );

  final CalendarEvent event;
  final String seriesId;
  final int seriesRevision;
  final String originalStartLocal;
  final CalendarRecurrenceRule rule;
  final bool isException;
  final bool isProviderSeries;

  @override
  List<Object?> get props => [
    event,
    seriesId,
    seriesRevision,
    originalStartLocal,
    isException,
  ];
}
