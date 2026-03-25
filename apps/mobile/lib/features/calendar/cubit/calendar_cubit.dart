import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/calendar_cache.dart';

part 'calendar_state.dart';

const _sentinel = Object();

class CalendarCubit extends Cubit<CalendarState> {
  CalendarCubit({
    required CalendarRepository calendarRepository,
    CalendarState? initialState,
  }) : _repo = calendarRepository,
       super(initialState ?? CalendarState(selectedDate: DateTime.now()));

  final CalendarRepository _repo;
  static final Map<String, _CalendarCacheEntry> _cache = {};
  String? _wsId;

  static CalendarState? cachedStateForWorkspace(String wsId) {
    return _cache[wsId]?.state;
  }

  static void clearCache() {
    _cache.clear();
  }

  /// Loads events within a 3-month window around the selected date.
  Future<void> loadEvents(String wsId, {bool forceRefresh = false}) async {
    final cached = _cache[wsId];
    final hasVisibleData = _wsId == wsId && state.hasLoadedOnce;
    _wsId = wsId;

    if (cached != null && !hasVisibleData) {
      emit(cached.state);
      if (!forceRefresh && isCalendarCacheFresh(cached.fetchedAt)) {
        return;
      }
    }

    if (!forceRefresh &&
        cached != null &&
        isCalendarCacheFresh(cached.fetchedAt) &&
        (hasVisibleData || cached.state.hasLoadedOnce)) {
      return;
    }

    if (hasVisibleData || cached != null) {
      emit(
        state.copyWith(
          status: CalendarStatus.loading,
          hasLoadedOnce: true,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: CalendarStatus.loading,
          hasLoadedOnce: false,
          events: const [],
          fetchedRange: null,
          clearError: true,
        ),
      );
    }

    try {
      final center = state.effectiveSelectedDate;
      final start = DateTime(center.year, center.month - 1);
      final end = DateTime(center.year, center.month + 2);

      final events = await _repo.getEvents(wsId, start: start, end: end);

      final nextState = state.copyWith(
        status: CalendarStatus.loaded,
        hasLoadedOnce: true,
        events: events,
        fetchedRange: DateTimeRange(start: start, end: end),
        clearError: true,
      );
      emit(nextState);
      _storeCache(nextState);
    } on Exception catch (e) {
      if (cached != null || hasVisibleData) {
        emit(
          state.copyWith(
            status: CalendarStatus.loaded,
            clearError: true,
          ),
        );
        return;
      }
      emit(state.copyWith(status: CalendarStatus.error, error: e.toString()));
    }
  }

  /// Extends the fetched range if the given date is outside it.
  Future<void> ensureRangeLoaded(String wsId, DateTime date) async {
    final range = state.fetchedRange;
    if (range != null &&
        !date.isBefore(range.start) &&
        !date.isAfter(range.end)) {
      return;
    }
    await loadEvents(wsId);
  }

  /// Loads the next month of events beyond the current fetched range.
  ///
  /// Used by the agenda view for infinite scroll. Appends new events to
  /// existing ones and extends the fetched range.
  Future<void> loadMoreForward(String wsId) async {
    final range = state.fetchedRange;
    if (range == null || state.isLoadingMore) return;

    emit(state.copyWith(isLoadingMore: true));

    final newStart = range.end;
    final newEnd = DateTime(newStart.year, newStart.month + 2);

    try {
      final moreEvents = await _repo.getEvents(
        wsId,
        start: newStart,
        end: newEnd,
      );

      // Deduplicate by ID (edges may overlap).
      final existingIds = state.events.map((e) => e.id).toSet();
      final uniqueNew = moreEvents
          .where((e) => !existingIds.contains(e.id))
          .toList();

      emit(
        _storeAndReturn(
          state.copyWith(
            events: [...state.events, ...uniqueNew],
            fetchedRange: DateTimeRange(start: range.start, end: newEnd),
            isLoadingMore: false,
          ),
        ),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString(), isLoadingMore: false));
    }
  }

  void selectDate(DateTime date) {
    emit(
      _storeAndReturn(
        state.copyWith(
          selectedDate: date,
          focusedMonth: DateTime(date.year, date.month),
        ),
      ),
    );
  }

  void goToToday() {
    final now = DateTime.now();
    emit(
      _storeAndReturn(
        state.copyWith(
          selectedDate: now,
          focusedMonth: DateTime(now.year, now.month),
        ),
      ),
    );
  }

  void navigateDay(int delta) {
    final current = state.effectiveSelectedDate;
    selectDate(current.add(Duration(days: delta)));
  }

  void setViewMode(CalendarViewMode mode) {
    emit(_storeAndReturn(state.copyWith(viewMode: mode)));
  }

  void setFocusedMonth(DateTime month) {
    emit(_storeAndReturn(state.copyWith(focusedMonth: month)));
  }

  /// Creates a new event.
  ///
  /// All-day is inferred from duration (multiple of 24h) — no explicit flag
  /// needed. The caller should set startAt to midnight and endAt to midnight
  /// + N days for all-day events.
  Future<void> createEvent(
    String wsId, {
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    String? description,
    String? color,
  }) async {
    try {
      final newEvent = await _repo.createEvent(wsId, {
        'title': title,
        'description': description,
        'start_at': startAt.toUtc().toIso8601String(),
        'end_at': endAt.toUtc().toIso8601String(),
        'color': color,
      });

      // Optimistic add.
      emit(
        _storeAndReturn(state.copyWith(events: [...state.events, newEvent])),
      );
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  /// Updates an event optimistically, then confirms with server.
  Future<void> updateEvent(
    String wsId,
    String eventId, {
    String? title,
    String? description,
    DateTime? startAt,
    DateTime? endAt,
    String? color,
  }) async {
    final data = <String, dynamic>{};
    if (title != null) data['title'] = title;
    if (description != null) data['description'] = description;
    if (startAt != null) data['start_at'] = startAt.toUtc().toIso8601String();
    if (endAt != null) data['end_at'] = endAt.toUtc().toIso8601String();
    if (color != null) data['color'] = color;

    // Optimistic local update.
    final updatedEvents = state.events.map((e) {
      if (e.id != eventId) return e;
      return e.copyWith(
        title: title ?? e.title,
        description: description ?? e.description,
        startAt: startAt ?? e.startAt,
        endAt: endAt ?? e.endAt,
        color: color ?? e.color,
      );
    }).toList();

    emit(_storeAndReturn(state.copyWith(events: updatedEvents)));

    try {
      await _repo.updateEvent(wsId, eventId, data);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  /// Deletes an event optimistically.
  Future<void> deleteEvent(String wsId, String eventId) async {
    final previousEvents = state.events;
    emit(
      _storeAndReturn(
        state.copyWith(
          events: state.events.where((e) => e.id != eventId).toList(),
        ),
      ),
    );

    try {
      await _repo.deleteEvent(wsId, eventId);
    } on Exception catch (e) {
      // Rollback on failure.
      emit(state.copyWith(events: previousEvents, error: e.toString()));
    }
  }

  CalendarState _storeAndReturn(CalendarState nextState) {
    _storeCache(nextState);
    return nextState;
  }

  void _storeCache(CalendarState nextState) {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _cache[wsId] = _CalendarCacheEntry(
      state: nextState,
      fetchedAt: DateTime.now(),
    );
  }
}

class _CalendarCacheEntry {
  const _CalendarCacheEntry({
    required this.state,
    required this.fetchedAt,
  });

  final CalendarState state;
  final DateTime fetchedAt;
}
