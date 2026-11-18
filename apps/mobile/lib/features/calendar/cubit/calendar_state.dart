part of 'calendar_cubit.dart';

const _sentinel = Object();

enum CalendarStatus { initial, loading, loaded, error }

enum CalendarViewMode { day, threeDays, week, month, agenda, year }

/// Projected events per source list; entries go away with their list.
final Expando<({String? zone, List<CalendarEvent> events})>
_displayEventsCache = Expando('calendar-display-events');

class CalendarState extends Equatable {
  const CalendarState({
    this.status = CalendarStatus.initial,
    this.hasLoadedOnce = false,
    this.isFromCache = false,
    this.isRefreshing = false,
    this.lastUpdatedAt,
    this.viewMode = CalendarViewMode.agenda,
    this.hasSelectedView = false,
    this.selectedDate,
    this.focusedMonth,
    this.events = const [],
    this.fetchedRange,
    this.error,
    this.isLoadingMore = false,
    this.timezone,
    this.timelineZoom = 1,
  });

  final CalendarStatus status;
  final bool hasLoadedOnce;
  final bool isFromCache;
  final bool isRefreshing;
  final DateTime? lastUpdatedAt;
  final CalendarViewMode viewMode;
  final bool hasSelectedView;
  final DateTime? selectedDate;
  final DateTime? focusedMonth;
  final List<CalendarEvent> events;
  final DateTimeRange? fetchedRange;
  final String? error;
  final bool isLoadingMore;
  final String? timezone;
  final double timelineZoom;

  /// [events] projected into [timezone]; computed once per events list and
  /// zone, so views and rebuilds share one list instead of re-projecting.
  List<CalendarEvent> get displayEvents {
    final cached = _displayEventsCache[events];
    if (cached != null && cached.zone == timezone) return cached.events;
    final projected = List<CalendarEvent>.unmodifiable(
      events.map((event) => calendarProjectEvent(event, timezone)),
    );
    _displayEventsCache[events] = (zone: timezone, events: projected);
    return projected;
  }

  DateTime get effectiveSelectedDate => selectedDate == null
      ? calendarNow(timezone)
      : calendarDate(
          selectedDate!.year,
          selectedDate!.month,
          selectedDate!.day,
        );
  DateTime get effectiveFocusedMonth => focusedMonth ?? effectiveSelectedDate;

  /// Events that overlap the selected date, sorted: all-day first, then by
  /// start time.
  List<CalendarEvent> get selectedDateEvents {
    final date = effectiveSelectedDate;
    return displayEvents
        .where((event) => calendarEventOverlapsDay(event, date))
        .toList()
      ..sort((a, b) {
        // All-day events first.
        final aAllDay = a.isAllDay;
        final bAllDay = b.isAllDay;
        if (aAllDay && !bAllDay) return -1;
        if (!aAllDay && bAllDay) return 1;
        // Then by start time.
        final aStart = a.startAt ?? calendarDate(0);
        final bStart = b.startAt ?? calendarDate(0);
        return aStart.compareTo(bStart);
      });
  }

  List<CalendarEvent> get allDayEvents =>
      selectedDateEvents.where((e) => e.isAllDay).toList();

  List<CalendarEvent> get timedEvents =>
      selectedDateEvents.where((e) => !e.isAllDay).toList();

  CalendarState copyWith({
    CalendarStatus? status,
    bool? hasLoadedOnce,
    bool? isFromCache,
    bool? isRefreshing,
    Object? lastUpdatedAt = _sentinel,
    CalendarViewMode? viewMode,
    double? timelineZoom,
    bool? hasSelectedView,
    Object? selectedDate = _sentinel,
    Object? focusedMonth = _sentinel,
    List<CalendarEvent>? events,
    Object? fetchedRange = _sentinel,
    String? error,
    bool clearError = false,
    bool? isLoadingMore,
    Object? timezone = _sentinel,
  }) => CalendarState(
    timezone: timezone == _sentinel ? this.timezone : timezone as String?,
    status: status ?? this.status,
    hasLoadedOnce: hasLoadedOnce ?? this.hasLoadedOnce,
    isFromCache: isFromCache ?? this.isFromCache,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    lastUpdatedAt: lastUpdatedAt == _sentinel
        ? this.lastUpdatedAt
        : lastUpdatedAt as DateTime?,
    viewMode: viewMode ?? this.viewMode,
    timelineZoom: timelineZoom ?? this.timelineZoom,
    hasSelectedView: hasSelectedView ?? this.hasSelectedView,
    selectedDate: selectedDate == _sentinel
        ? this.selectedDate
        : selectedDate as DateTime?,
    focusedMonth: focusedMonth == _sentinel
        ? this.focusedMonth
        : focusedMonth as DateTime?,
    events: events ?? this.events,
    fetchedRange: fetchedRange == _sentinel
        ? this.fetchedRange
        : fetchedRange as DateTimeRange?,
    error: clearError ? null : (error ?? this.error),
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
  );

  @override
  List<Object?> get props => [
    status,
    hasLoadedOnce,
    isFromCache,
    isRefreshing,
    lastUpdatedAt,
    viewMode,
    timelineZoom,
    hasSelectedView,
    selectedDate,
    focusedMonth,
    events,
    fetchedRange,
    error,
    isLoadingMore,
    timezone,
  ];
}
