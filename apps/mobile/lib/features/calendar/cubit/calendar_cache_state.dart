part of 'calendar_cubit.dart';

Map<String, dynamic> _stateToCacheJson(CalendarState state) {
  return {
    'selectedDate': state.selectedDate?.toIso8601String(),
    'focusedMonth': state.focusedMonth?.toIso8601String(),
    'viewMode': state.viewMode.name,
    'timelineZoom': state.timelineZoom,
    'hasSelectedView': state.hasSelectedView,
    'events': state.events
        .map((event) => event.toJson())
        .toList(growable: false),
    'fetchedRange': state.fetchedRange == null
        ? null
        : {
            'start': state.fetchedRange!.start.toIso8601String(),
            'end': state.fetchedRange!.end.toIso8601String(),
          },
    'hasLoadedOnce': state.hasLoadedOnce,
    'lastUpdatedAt': state.lastUpdatedAt?.toIso8601String(),
  };
}

CalendarState _stateFromCacheJson(Map<String, dynamic> json) {
  final fetchedRangeJson = json['fetchedRange'];
  DateTimeRange? fetchedRange;
  if (fetchedRangeJson is Map<String, dynamic>) {
    final start = DateTime.tryParse(fetchedRangeJson['start'] as String? ?? '');
    final end = DateTime.tryParse(fetchedRangeJson['end'] as String? ?? '');
    if (start != null && end != null) {
      fetchedRange = DateTimeRange(start: start, end: end);
    }
  }

  final viewMode = CalendarViewMode.values.firstWhere(
    (value) => value.name == json['viewMode'],
    orElse: () => CalendarViewMode.agenda,
  );

  return CalendarState(
    status: CalendarStatus.loaded,
    hasLoadedOnce: json['hasLoadedOnce'] as bool? ?? true,
    isFromCache: true,
    lastUpdatedAt: json['lastUpdatedAt'] != null
        ? DateTime.tryParse(json['lastUpdatedAt'] as String)
        : null,
    viewMode: viewMode,
    timelineZoom: calendarTimelineZoom(json['timelineZoom']),
    hasSelectedView: json['hasSelectedView'] == true,
    selectedDate: json['selectedDate'] != null
        ? DateTime.tryParse(json['selectedDate'] as String)
        : null,
    focusedMonth: json['focusedMonth'] != null
        ? DateTime.tryParse(json['focusedMonth'] as String)
        : null,
    events: deduplicateCalendarEvents(
      ((json['events'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CalendarEvent.fromJson),
    ),
    fetchedRange: fetchedRange,
  );
}

DateTimeRange _targetRangeFor(DateTime center, CalendarViewMode mode) {
  switch (mode) {
    case CalendarViewMode.year:
      return DateTimeRange(
        start: calendarDate(center.year),
        end: calendarDate(center.year + 1),
      );
    case CalendarViewMode.day:
    case CalendarViewMode.threeDays:
    case CalendarViewMode.week:
    case CalendarViewMode.month:
    case CalendarViewMode.agenda:
      return DateTimeRange(
        start: calendarDate(center.year, center.month - 1),
        end: calendarDate(center.year, center.month + 2),
      );
  }
}
