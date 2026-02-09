part of 'calendar_cubit.dart';

enum CalendarStatus { initial, loading, loaded, error }

enum CalendarViewMode { day, threeDays, week, month, agenda }

class CalendarState extends Equatable {
  const CalendarState({
    this.status = CalendarStatus.initial,
    this.viewMode = CalendarViewMode.agenda,
    this.selectedDate,
    this.focusedMonth,
    this.events = const [],
    this.fetchedRange,
    this.error,
    this.isLoadingMore = false,
  });

  final CalendarStatus status;
  final CalendarViewMode viewMode;
  final DateTime? selectedDate;
  final DateTime? focusedMonth;
  final List<CalendarEvent> events;
  final DateTimeRange? fetchedRange;
  final String? error;
  final bool isLoadingMore;

  DateTime get effectiveSelectedDate => selectedDate ?? DateTime.now();
  DateTime get effectiveFocusedMonth => focusedMonth ?? effectiveSelectedDate;

  /// Events that overlap the selected date, sorted: all-day first, then by
  /// start time.
  List<CalendarEvent> get selectedDateEvents {
    final date = effectiveSelectedDate;
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    return events.where((e) {
      if (e.isAllDay) {
        // All-day events: endAt is exclusive (midnight after last day).
        // E.g. Feb 3 → Feb 9 means event covers Feb 3-8 only.
        final start = e.startAt;
        final end = e.endAt ?? start;
        if (start == null) return false;
        final eventStart = DateTime(start.year, start.month, start.day);
        final eventEnd = DateTime(end!.year, end.month, end.day);
        return dayStart.isBefore(eventEnd) && dayEnd.isAfter(eventStart);
      }
      // Timed events: overlap with the day.
      final start = e.startAt;
      final end = e.endAt ?? start;
      if (start == null) return false;
      return start.isBefore(dayEnd) && (end!.isAfter(dayStart));
    }).toList()..sort((a, b) {
      // All-day events first.
      final aAllDay = a.isAllDay;
      final bAllDay = b.isAllDay;
      if (aAllDay && !bAllDay) return -1;
      if (!aAllDay && bAllDay) return 1;
      // Then by start time.
      final aStart = a.startAt ?? DateTime(0);
      final bStart = b.startAt ?? DateTime(0);
      return aStart.compareTo(bStart);
    });
  }

  List<CalendarEvent> get allDayEvents =>
      selectedDateEvents.where((e) => e.isAllDay).toList();

  List<CalendarEvent> get timedEvents =>
      selectedDateEvents.where((e) => !e.isAllDay).toList();

  CalendarState copyWith({
    CalendarStatus? status,
    CalendarViewMode? viewMode,
    Object? selectedDate = _sentinel,
    Object? focusedMonth = _sentinel,
    List<CalendarEvent>? events,
    Object? fetchedRange = _sentinel,
    String? error,
    bool clearError = false,
    bool? isLoadingMore,
  }) => CalendarState(
    status: status ?? this.status,
    viewMode: viewMode ?? this.viewMode,
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
    viewMode,
    selectedDate,
    focusedMonth,
    events,
    fetchedRange,
    error,
    isLoadingMore,
  ];
}
