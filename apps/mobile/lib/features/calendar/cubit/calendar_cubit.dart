import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_event_deduplication.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';

part 'calendar_state.dart';
part 'calendar_cache_state.dart';
part 'calendar_provider_color_actions.dart';

class CalendarCubit extends Cubit<CalendarState> {
  CalendarCubit({
    required CalendarRepository calendarRepository,
    CalendarState? initialState,
    CalendarViewMode defaultViewMode = CalendarViewMode.agenda,
  }) : _repo = calendarRepository,
       _defaultViewMode = defaultViewMode,
       super(
         initialState?.hasSelectedView == true
             ? initialState!
             : (initialState ?? CalendarState(selectedDate: DateTime.now()))
                   .copyWith(viewMode: defaultViewMode),
       ) {
    OfflineMutationQueue.instance.syncRevision.addListener(_onSynchronized);
  }

  void _onSynchronized() {
    final wsId = _wsId;
    if (!isClosed && wsId != null) {
      unawaited(loadEvents(wsId).then<void>((_) {}, onError: (Object _) {}));
    }
  }

  @override
  Future<void> close() {
    OfflineMutationQueue.instance.syncRevision.removeListener(_onSynchronized);
    return super.close();
  }

  CalendarViewMode _defaultViewMode;
  void _publishProviderState(CalendarState next) => emit(next);

  void setTimezone(String? timezone) {
    if (state.timezone == timezone) return;
    emit(
      state.copyWith(
        timezone: timezone,
        selectedDate:
            state.timezone == null && state.selectedDate?.isUtc == false
            ? calendarWallDate(state.selectedDate!, timezone)
            : state.hasLoadedOnce || state.selectedDate?.isUtc == true
            ? state.selectedDate
            : calendarNow(timezone),
      ),
    );
  }

  void updateDefaultView(CalendarViewMode mode) {
    _defaultViewMode = mode;
    if (!state.hasSelectedView) emit(state.copyWith(viewMode: mode));
  }

  CalendarState _restoreView(CalendarState cached) => cached.copyWith(
    timezone: state.timezone,
    viewMode: state.hasSelectedView
        ? state.viewMode
        : cached.hasSelectedView
        ? cached.viewMode
        : _defaultViewMode,
    hasSelectedView: state.hasSelectedView || cached.hasSelectedView,
  );

  final CalendarRepository _repo;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'calendar:events';
  static final Map<String, _CalendarCacheEntry> _cache = {};
  static int _cacheEpoch = 0;
  String? _wsId;
  int _loadGeneration = 0;
  static final Map<String, int> _mutationVersions = {};
  static final Map<String, int> _refreshVersions = {};

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid calendar cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'calendar.events.utc.v2',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static String _memoryCacheKey(String wsId) => userScopedCacheKey(wsId);

  static CalendarState? cachedStateForWorkspace(String wsId) {
    return _cache[_memoryCacheKey(wsId)]?.state;
  }

  static CalendarState? seedStateForWorkspace(String wsId) {
    final cached = CacheStore.instance.peek<CalendarState>(
      key: _cacheKey(wsId),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    final state = cached.data;
    if (!cached.hasValue || state == null) {
      return cachedStateForWorkspace(wsId);
    }

    _rememberCachedState(wsId, state, fetchedAt: cached.fetchedAt);
    return state;
  }

  static void _rememberCachedState(
    String wsId,
    CalendarState state, {
    DateTime? fetchedAt,
  }) {
    _cache[_memoryCacheKey(wsId)] = _CalendarCacheEntry(
      state: state,
      fetchedAt: fetchedAt ?? DateTime.now(),
    );
  }

  static void clearCache() {
    _cache.clear();
    _mutationVersions.clear();
    _refreshVersions.clear();
    _cacheEpoch++;
  }

  static Future<void> prewarm({
    required CalendarRepository calendarRepository,
    required String wsId,
    bool forceRefresh = false,
  }) async {
    final center = DateTime.now();
    final targetRange = _targetRangeFor(center, CalendarViewMode.agenda);
    final start = targetRange.start;
    final end = targetRange.end;
    await CacheStore.instance.prefetch<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeCacheJson,
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:calendar'],
      fetch: () async {
        final events = deduplicateCalendarEvents(
          await calendarRepository.getEvents(
            wsId,
            start: calendarWallToUtc(start, null),
            end: calendarWallToUtc(end, null),
          ),
        );
        final previous = seedStateForWorkspace(wsId);
        return {
          'selectedDate': center.toIso8601String(),
          'focusedMonth': calendarDate(
            center.year,
            center.month,
          ).toIso8601String(),
          'viewMode': previous?.viewMode.name ?? CalendarViewMode.agenda.name,
          'hasSelectedView': previous?.hasSelectedView ?? false,
          'events': events
              .map((event) => event.toJson())
              .toList(growable: false),
          'fetchedRange': {
            'start': start.toIso8601String(),
            'end': end.toIso8601String(),
          },
        };
      },
    );
  }

  /// Loads events within a 3-month window around the selected date.
  Future<void> loadEvents(String wsId, {bool forceRefresh = false}) async {
    if (isClosed) return;
    final generation = ++_loadGeneration;
    // A refresh supersedes pending pagination, whose callback will be ignored.
    if (state.isLoadingMore) emit(state.copyWith(isLoadingMore: false));
    final userId = currentCacheUserId();
    bool isCurrent() =>
        !isClosed &&
        generation == _loadGeneration &&
        userId == currentCacheUserId() &&
        _wsId == wsId;
    final memoryCacheKey = _memoryCacheKey(wsId);
    final hasVisibleData = _wsId == wsId && state.hasLoadedOnce;
    final cached =
        _cache[memoryCacheKey] ??
        (hasVisibleData && state.events.isNotEmpty
            ? _CalendarCacheEntry(
                state: state,
                fetchedAt: state.lastUpdatedAt ?? DateTime.now(),
              )
            : null);
    if (_wsId != null && _wsId != wsId) {
      emit(CalendarState(viewMode: _defaultViewMode, timezone: state.timezone));
    }
    _wsId = wsId;
    final cacheKey = _cacheKey(wsId);
    final shouldReadDiskCache = cached == null && !hasVisibleData;

    if (forceRefresh) {
      if (cached != null && !hasVisibleData) {
        emit(_restoreView(cached.state));
      }
      emit(
        state.copyWith(
          status: CalendarStatus.loading,
          hasLoadedOnce: state.hasLoadedOnce || cached != null,
          isFromCache: state.hasLoadedOnce || cached != null,
          isRefreshing: state.hasLoadedOnce || cached != null,
          lastUpdatedAt: cached?.fetchedAt,
          clearError: true,
        ),
      );
    }

    final diskCached = shouldReadDiskCache
        ? await CacheStore.instance.read<CalendarState>(
            key: cacheKey,
            decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
          )
        : null;

    if (!isCurrent()) return;

    if (diskCached?.hasValue == true &&
        !hasVisibleData &&
        diskCached?.data != null) {
      _rememberCachedState(
        wsId,
        diskCached!.data!,
        fetchedAt: diskCached.fetchedAt,
      );
      emit(_restoreView(diskCached.data!));
    }

    if (cached != null && !hasVisibleData) {
      _rememberCachedState(wsId, cached.state, fetchedAt: cached.fetchedAt);
      emit(_restoreView(cached.state));
    }

    if (hasVisibleData || cached != null || diskCached?.hasValue == true) {
      emit(
        state.copyWith(
          status: CalendarStatus.loading,
          hasLoadedOnce: true,
          isFromCache: cached != null || (diskCached?.hasValue ?? false),
          isRefreshing: true,
          lastUpdatedAt: cached?.fetchedAt ?? diskCached?.fetchedAt,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: CalendarStatus.loading,
          hasLoadedOnce: false,
          isFromCache: false,
          isRefreshing: false,
          events: const [],
          fetchedRange: null,
          clearError: true,
        ),
      );
    }

    try {
      final center = state.viewMode == CalendarViewMode.year
          ? state.effectiveFocusedMonth
          : state.effectiveSelectedDate;
      final targetRange = _targetRangeFor(center, state.viewMode);
      final start = targetRange.start;
      final end = targetRange.end;

      final events = deduplicateCalendarEvents(
        await _repo.getEvents(
          wsId,
          start: calendarWallToUtc(start, state.timezone),
          end: calendarWallToUtc(end, state.timezone),
        ),
      );

      if (!isCurrent()) return;
      _refreshVersions[memoryCacheKey] =
          (_refreshVersions[memoryCacheKey] ?? 0) + 1;
      final nextState = state.copyWith(
        status: CalendarStatus.loaded,
        hasLoadedOnce: true,
        isFromCache: false,
        isRefreshing: false,
        lastUpdatedAt: DateTime.now(),
        events: events,
        fetchedRange: DateTimeRange(start: start, end: end),
        clearError: true,
      );
      emit(nextState);
      _storeCache(nextState);
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: _stateToCacheJson(nextState),
        tags: [_cacheTag, 'workspace:$wsId', 'module:calendar'],
      );
    } on Exception catch (e) {
      if (!isCurrent()) return;
      if (e is ApiException && (e.statusCode == 401 || e.statusCode == 403)) {
        _cache.remove(memoryCacheKey);
        emit(
          CalendarState(
            selectedDate: state.selectedDate,
            timezone: state.timezone,
            status: CalendarStatus.error,
            error: e.toString(),
          ),
        );
        try {
          await CacheStore.instance.remove(cacheKey);
        } on Exception {
          // Keep access denied even when persistent storage is unavailable.
        }
        return;
      }
      if (cached != null || hasVisibleData || (diskCached?.hasValue ?? false)) {
        emit(
          state.copyWith(
            status: CalendarStatus.loaded,
            isRefreshing: false,
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
    final targetRange = _targetRangeFor(date, state.viewMode);
    if (range != null &&
        !targetRange.start.isBefore(range.start) &&
        !targetRange.end.isAfter(range.end)) {
      return;
    }
    await loadEvents(wsId, forceRefresh: true);
  }

  /// Loads the next month of events beyond the current fetched range.
  ///
  /// Used by the agenda view for infinite scroll. Appends new events to
  /// existing ones and extends the fetched range.
  Future<void> loadMoreForward(String wsId) async {
    final range = state.fetchedRange;
    if (range == null || state.isLoadingMore || _wsId != wsId || isClosed) {
      return;
    }
    final generation = _loadGeneration;
    final userId = currentCacheUserId();
    bool isCurrent() =>
        !isClosed &&
        _wsId == wsId &&
        generation == _loadGeneration &&
        userId == currentCacheUserId();

    emit(state.copyWith(isLoadingMore: true));

    final newStart = range.end;
    final newEnd = calendarDate(newStart.year, newStart.month + 2);

    try {
      final moreEvents = await _repo.getEvents(
        wsId,
        start: calendarWallToUtc(newStart, state.timezone),
        end: calendarWallToUtc(newEnd, state.timezone),
      );

      if (!isCurrent()) return;
      emit(
        _storeAndReturn(
          state.copyWith(
            events: deduplicateCalendarEvents([...state.events, ...moreEvents]),
            fetchedRange: DateTimeRange(start: range.start, end: newEnd),
            isLoadingMore: false,
          ),
        ),
      );
    } on Exception catch (e) {
      if (!isCurrent()) return;
      emit(state.copyWith(error: e.toString(), isLoadingMore: false));
    }
  }

  void selectDate(DateTime date) {
    emit(
      _storeAndReturn(
        state.copyWith(
          selectedDate: calendarDate(date.year, date.month, date.day),
          focusedMonth: calendarDate(date.year, date.month),
        ),
      ),
    );
  }

  void goToToday() {
    final now = calendarNow(state.timezone);
    emit(
      _storeAndReturn(
        state.copyWith(
          selectedDate: now,
          focusedMonth: calendarDate(now.year, now.month),
        ),
      ),
    );
  }

  void navigateDay(int delta) {
    final current = state.effectiveSelectedDate;
    selectDate(current.add(Duration(days: delta)));
  }

  Future<void> setViewMode(CalendarViewMode mode) async {
    final next = state.copyWith(viewMode: mode, hasSelectedView: true);
    emit(_storeAndReturn(next));
    final wsId = _wsId;
    if (wsId == null) return;
    try {
      await CacheStore.instance.write(
        key: _cacheKey(wsId),
        policy: _cachePolicy,
        payload: _stateToCacheJson(next),
        tags: [_cacheTag, 'workspace:$wsId', 'module:calendar'],
      );
    } on Exception {
      debugPrint('Calendar view preference could not be persisted.');
    }
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
    if (isClosed || _wsId != wsId) return;
    final userId = currentCacheUserId();
    final cacheKey = _memoryCacheKey(wsId);
    try {
      final newEvent = await _repo.createEvent(wsId, {
        'title': title,
        'description': description,
        'start_at': startAt.toUtc().toIso8601String(),
        'end_at': endAt.toUtc().toIso8601String(),
        'color': color,
      });

      if (userId != currentCacheUserId()) return;
      final active = !isClosed && _wsId == wsId;
      final current = active ? state : _cache[cacheKey]?.state;
      if (current == null) return;
      final nextState = current.copyWith(
        events: deduplicateCalendarEvents([...current.events, newEvent]),
      );
      _cache[cacheKey] = _CalendarCacheEntry(
        state: nextState,
        fetchedAt: DateTime.now(),
      );
      if (active) emit(nextState);
    } on Exception catch (e) {
      if (isClosed || _wsId != wsId || userId != currentCacheUserId()) return;
      emit(state.copyWith(error: e.toString()));
    }
  }

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

    if (isClosed || _wsId != wsId) return;
    final rollback = _captureRollback(wsId, eventId);
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
      rollback(e);
    }
  }

  /// Deletes an event optimistically.
  Future<void> deleteEvent(String wsId, String eventId) async {
    if (isClosed || _wsId != wsId) return;
    final rollback = _captureRollback(wsId, eventId);
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
      rollback(e);
    }
  }

  void Function(Exception) _captureRollback(String wsId, String eventId) {
    final userId = currentCacheUserId();
    final cacheKey = CalendarCubit._memoryCacheKey(wsId);
    final mutationKey = '$cacheKey::$eventId';
    final version = (_mutationVersions[mutationKey] ?? 0) + 1;
    _mutationVersions[mutationKey] = version;
    final refreshVersion = _refreshVersions[cacheKey];
    final epoch = _cacheEpoch;
    final fetchedAt =
        _cache[cacheKey]?.fetchedAt ??
        state.lastUpdatedAt ??
        DateTime.fromMillisecondsSinceEpoch(0);
    final previousIndex = state.events.indexWhere(
      (event) => event.id == eventId,
    );
    final previousEvent = previousIndex < 0
        ? null
        : state.events[previousIndex];

    return (error) {
      if (epoch != _cacheEpoch ||
          userId != currentCacheUserId() ||
          _mutationVersions[mutationKey] != version ||
          _refreshVersions[cacheKey] != refreshVersion) {
        return;
      }
      final active = !isClosed && _wsId == wsId;
      final current = active ? state : CalendarCubit._cache[cacheKey]?.state;
      if (current == null) return;
      final events = [...current.events];
      final index = events.indexWhere((event) => event.id == eventId);
      if (previousEvent != null) {
        if (index < 0) {
          events.insert(previousIndex.clamp(0, events.length), previousEvent);
        } else {
          events[index] = previousEvent;
        }
      }
      final message = error is ApiException
          ? error.message.trim()
          : error.toString();
      final restored = current.copyWith(
        events: events,
        error: active ? (message.isEmpty ? error.toString() : message) : null,
      );
      CalendarCubit._cache[cacheKey] = _CalendarCacheEntry(
        state: restored,
        fetchedAt: fetchedAt,
      );
      if (active) emit(restored);
    };
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

    _rememberCachedState(wsId, nextState);
  }
}

class _CalendarCacheEntry {
  const _CalendarCacheEntry({required this.state, required this.fetchedAt});

  final CalendarState state;
  final DateTime fetchedAt;
}
