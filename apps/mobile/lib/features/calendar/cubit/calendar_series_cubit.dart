import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/data/repositories/calendar_series_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Why a series read or write did not apply. Each maps to the web copy.
enum CalendarSeriesFailure {
  offline,
  conflict,
  denied,
  invalid,
  unavailable,
  failed,
}

CalendarSeriesFailure calendarSeriesFailureOf(Object error) {
  if (isOfflineTransportFailure(error)) return CalendarSeriesFailure.offline;
  if (error is! ApiException) return CalendarSeriesFailure.failed;
  return switch (error.statusCode) {
    409 => CalendarSeriesFailure.conflict,
    403 when !error.isVerificationRequired => CalendarSeriesFailure.denied,
    400 || 422 => CalendarSeriesFailure.invalid,
    404 => CalendarSeriesFailure.unavailable,
    _ => CalendarSeriesFailure.failed,
  };
}

class CalendarSeriesState extends Equatable {
  const CalendarSeriesState({
    this.occurrences = const [],
    this.loadFailure,
    this.generation = 0,
  });

  final List<CalendarSeriesOccurrence> occurrences;
  final CalendarSeriesFailure? loadFailure;

  /// Advances on every completed load so listeners can surface each failure.
  final int generation;

  @override
  List<Object?> get props => [occurrences, loadFailure, generation];
}

/// Virtual occurrences of native recurring series for the calendar's loaded
/// range. Ordinary event CRUD never touches them; every change goes through a
/// scoped series operation and then reloads the range.
class CalendarSeriesCubit extends Cubit<CalendarSeriesState> {
  CalendarSeriesCubit({
    CalendarSeriesRepository? repository,
    String? Function()? currentUserId,
  }) : _repository = repository ?? CalendarSeriesRepository(),
       _owner = currentUserId ?? currentCacheUserId,
       super(const CalendarSeriesState());

  final CalendarSeriesRepository _repository;
  final String? Function() _owner;
  String? _wsId;
  DateTimeRange? _range;
  int _loadGeneration = 0;
  ({
    List<CalendarEvent> events,
    List<CalendarSeriesOccurrence> occurrences,
    List<CalendarEvent> merged,
  })?
  _merged;

  CalendarSeriesOccurrence? occurrenceFor(String eventId) {
    for (final occurrence in state.occurrences) {
      if (occurrence.event.id == eventId) return occurrence;
    }
    return null;
  }

  /// [events] followed by the loaded occurrences. The same inputs return the
  /// same list, so per-list display projections stay cached across rebuilds.
  List<CalendarEvent> mergeInto(List<CalendarEvent> events) {
    final occurrences = state.occurrences;
    if (occurrences.isEmpty) return events;
    final cached = _merged;
    if (cached != null &&
        identical(cached.events, events) &&
        identical(cached.occurrences, occurrences)) {
      return cached.merged;
    }
    final merged = List<CalendarEvent>.unmodifiable([
      ...events,
      for (final occurrence in occurrences) occurrence.event,
    ]);
    _merged = (events: events, occurrences: occurrences, merged: merged);
    return merged;
  }

  /// Loads occurrences overlapping the instants `[start, end)`.
  Future<void> load(
    String wsId,
    DateTimeRange range, {
    bool force = false,
  }) async {
    if (isClosed) return;
    if (!force && _wsId == wsId && _range == range) return;
    if (_wsId != wsId) {
      emit(CalendarSeriesState(generation: state.generation + 1));
    }
    _wsId = wsId;
    _range = range;
    final generation = ++_loadGeneration;
    final userId = _owner();
    bool isCurrent() =>
        !isClosed &&
        generation == _loadGeneration &&
        _wsId == wsId &&
        _owner() == userId;
    try {
      final occurrences = <CalendarSeriesOccurrence>[];
      var from = range.start;
      while (from.isBefore(range.end)) {
        final capped = from.add(
          const Duration(days: calendarSeriesMaxRangeDays),
        );
        final to = capped.isBefore(range.end) ? capped : range.end;
        occurrences.addAll(
          await _repository.listOccurrences(wsId, from: from, to: to),
        );
        if (!isCurrent()) return;
        from = to;
      }
      final seen = <String>{};
      emit(
        CalendarSeriesState(
          occurrences: List.unmodifiable(
            occurrences.where((item) => seen.add(item.event.id)),
          ),
          generation: state.generation + 1,
        ),
      );
    } on Object catch (error) {
      if (!isCurrent()) return;
      final failure = calendarSeriesFailureOf(error);
      emit(
        CalendarSeriesState(
          occurrences: failure == CalendarSeriesFailure.denied
              ? const []
              : state.occurrences,
          loadFailure: failure,
          generation: state.generation + 1,
        ),
      );
    }
  }

  Future<void> reload() async {
    final wsId = _wsId;
    final range = _range;
    if (wsId != null && range != null) await load(wsId, range, force: true);
  }

  Future<NativeCalendarSeries> readSeries(String wsId, String seriesId) =>
      _repository.getSeries(wsId, seriesId);

  Future<CalendarSeriesFailure?> _write(Future<void> Function() write) async {
    try {
      await write();
    } on Object catch (error) {
      return calendarSeriesFailureOf(error);
    }
    await reload();
    return null;
  }

  Future<CalendarSeriesFailure?> create(
    String wsId, {
    required String requestId,
    required CalendarRecurrenceRule rule,
    required CalendarRecurrenceAnchor anchor,
    required Map<String, dynamic> event,
  }) => _write(
    () => _repository.createSeries(
      wsId,
      requestId: requestId,
      rule: rule,
      anchor: anchor,
      event: event,
    ),
  );

  /// [expectedRevision] is the revision the user saw; a newer one answers
  /// with a conflict instead of overwriting.
  Future<CalendarSeriesFailure?> mutate(
    String wsId,
    CalendarSeriesOccurrence occurrence, {
    required int expectedRevision,
    required bool delete,
    required String requestId,
    required CalendarRecurrenceScope scope,
    Map<String, dynamic>? event,
    CalendarRecurrenceRule? rule,
    CalendarRecurrenceAnchor? anchor,
  }) => _write(
    () => _repository.mutateSeries(
      wsId,
      occurrence.seriesId,
      delete: delete,
      requestId: requestId,
      expectedRevision: expectedRevision,
      scope: scope,
      originalStartLocal: occurrence.originalStartLocal,
      event: event,
      rule: rule,
      anchor: anchor,
    ),
  );

  @override
  Future<void> close() {
    _repository.dispose();
    return super.close();
  }
}
