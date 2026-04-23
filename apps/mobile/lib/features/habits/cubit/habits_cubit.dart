import 'dart:async';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habits_cache.dart';

part 'habits_cache_json.dart';

class HabitsCubit extends Cubit<HabitsState> {
  HabitsCubit({
    required IHabitTrackerRepository repository,
    HabitsState? initialState,
  }) : _repository = repository,
       super(initialState ?? const HabitsState());

  final IHabitTrackerRepository _repository;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'habits:workspace';
  static final Map<String, _HabitsCacheEntry> _cache = {};
  static final Map<String, String> _latestCacheKeyByWorkspace = {};
  int _listRequestToken = 0;
  int _detailRequestToken = 0;
  int _activityRequestToken = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid habits cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static HabitsState? cachedStateForWorkspace(String wsId) {
    final key = _latestCacheKeyByWorkspace[userScopedCacheKey(wsId)];
    if (key == null) {
      return null;
    }
    return _cache[key]?.state;
  }

  static CacheKey _storeKey(
    String wsId,
    HabitTrackerScope scope,
    String? userId,
  ) {
    return CacheKey(
      namespace: 'habits.workspace',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {
        'scope': scope.apiValue,
        if (userId != null && userId.isNotEmpty) 'scopeUserId': userId,
      },
    );
  }

  static HabitsState? seedStateForWorkspace(
    String wsId, {
    HabitTrackerScope initialScope = HabitTrackerScope.self,
    String? userId,
  }) {
    final cached = CacheStore.instance.peek<HabitsState>(
      key: _storeKey(wsId, initialScope, userId),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!cached.hasValue || cached.data == null) {
      return cachedStateForWorkspace(wsId);
    }

    final cacheKey = _cacheKeyFor(wsId, initialScope, userId);
    _cache[cacheKey] = _HabitsCacheEntry(
      state: cached.data!,
      fetchedAt: cached.fetchedAt ?? DateTime.now(),
    );
    _latestCacheKeyByWorkspace[userScopedCacheKey(wsId)] = cacheKey;
    return cached.data;
  }

  static void clearCache() {
    _cache.clear();
    _latestCacheKeyByWorkspace.clear();
  }

  static Future<void> prewarm({
    required IHabitTrackerRepository repository,
    required String wsId,
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
    bool includeActivity = false,
    bool forceRefresh = false,
  }) async {
    final scopeUserId = scope == HabitTrackerScope.member ? userId : null;
    try {
      await CacheStore.instance.prefetch<HabitsState>(
        key: _storeKey(wsId, scope, scopeUserId),
        policy: _cachePolicy,
        decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
        forceRefresh: forceRefresh,
        tags: [_cacheTag, 'workspace:$wsId', 'module:habits'],
        fetch: () async {
          final response = await repository.listTrackers(
            wsId,
            scope: scope,
            userId: scopeUserId,
          );
          final selectedTrackerId = response.trackers.isEmpty
              ? null
              : response.trackers.first.tracker.id;

          HabitTrackerDetailResponse? detail;
          var activityEntries = const <HabitActivityEntry>[];

          if (includeActivity && response.trackers.isNotEmpty) {
            final details = await Future.wait(
              response.trackers.map(
                (summary) => repository.getTrackerDetail(
                  wsId,
                  summary.tracker.id,
                  scope: scope,
                  userId: scopeUserId,
                ),
              ),
            );
            detail = details.isEmpty ? null : details.first;
            activityEntries =
                details
                    .expand(
                      (value) => value.entries.map(
                        (entry) => HabitActivityEntry(
                          tracker: value.tracker,
                          entry: entry,
                        ),
                      ),
                    )
                    .toList(growable: false)
                  ..sort(
                    (left, right) => right.timestamp.compareTo(left.timestamp),
                  );
          }

          final now = DateTime.now();
          return _stateToCacheJson(
            HabitsState(
              status: HabitsStatus.loaded,
              detailStatus: detail == null
                  ? HabitsStatus.initial
                  : HabitsStatus.loaded,
              activityStatus: activityEntries.isEmpty
                  ? HabitsStatus.initial
                  : HabitsStatus.loaded,
              activeWorkspaceId: wsId,
              listResponse: response,
              detail: detail,
              activityEntries: activityEntries,
              selectedTrackerId: selectedTrackerId,
              selectedScope: scope,
              selectedMemberId: scopeUserId,
              detailScope: detail == null ? null : scope,
              detailScopeUserId: detail == null ? null : scopeUserId,
              lastUpdatedAt: now,
              detailLastUpdatedAt: detail == null ? null : now,
              activityLastUpdatedAt: activityEntries.isEmpty ? null : now,
            ),
          );
        },
      );
    } on ApiException catch (error) {
      if (error.statusCode == 404) {
        developer.log(
          'Skipping habits prewarm for workspace $wsId because the '
          'habit-trackers endpoint returned 404.',
          name: 'HabitsCubit',
        );
        return;
      }
      rethrow;
    }
  }

  Future<void> loadWorkspace(
    String wsId, {
    bool refresh = false,
    HabitTrackerScope? scopeOverride,
  }) async {
    final isSameWorkspace = state.activeWorkspaceId == wsId;
    final effectiveScope = scopeOverride ?? state.selectedScope;
    final requestedMemberId = effectiveScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    final cacheKey = _cacheKeyFor(wsId, effectiveScope, requestedMemberId);
    final cached = _cache[cacheKey];
    final diskCached = cached == null
        ? await CacheStore.instance.read<HabitsState>(
            key: _storeKey(wsId, effectiveScope, requestedMemberId),
            decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
          )
        : null;
    var hasVisibleData =
        isSameWorkspace &&
        state.listResponse != null &&
        effectiveScope == state.selectedScope &&
        requestedMemberId == _scopeUserIdFor(effectiveScope, state);

    if (diskCached?.hasValue == true &&
        diskCached?.data != null &&
        !hasVisibleData) {
      final cachedState = _decorateCachedState(
        diskCached!.data!,
        fetchedAt: diskCached.fetchedAt,
      );
      emit(cachedState);
      _cache[cacheKey] = _HabitsCacheEntry(
        state: cachedState,
        fetchedAt: diskCached.fetchedAt ?? DateTime.now(),
      );
      _latestCacheKeyByWorkspace[userScopedCacheKey(wsId)] = cacheKey;
      hasVisibleData = true;
      if (!refresh && diskCached.isFresh) {
        return;
      }
    }

    if (cached != null && !hasVisibleData) {
      emit(_decorateCachedState(cached.state, fetchedAt: cached.fetchedAt));
      hasVisibleData = true;
      if (!refresh && isHabitsCacheFresh(cached.fetchedAt)) {
        return;
      }
    }

    if (!refresh &&
        hasVisibleData &&
        state.status == HabitsStatus.loaded &&
        cached != null &&
        isHabitsCacheFresh(cached.fetchedAt)) {
      return;
    }

    final requestToken = ++_listRequestToken;
    if (hasVisibleData) {
      emit(
        state.copyWith(
          status: HabitsStatus.loaded,
          activeWorkspaceId: wsId,
          selectedScope: effectiveScope,
          selectedMemberId: requestedMemberId,
          isRefreshing: true,
          error: null,
          detailError: null,
          activityError: null,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: HabitsStatus.loading,
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: null,
          isDetailFromCache: false,
          isDetailRefreshing: false,
          detailLastUpdatedAt: null,
          isActivityFromCache: false,
          isActivityRefreshing: false,
          activityLastUpdatedAt: null,
          activityStatus: HabitsStatus.initial,
          activeWorkspaceId: wsId,
          selectedScope: effectiveScope,
          selectedMemberId: requestedMemberId,
          activityEntries: const [],
          error: null,
          detailError: null,
          activityError: null,
        ),
      );
    }

    try {
      final previousMemberId = state.selectedMemberId;
      final response = await _repository.listTrackers(
        wsId,
        scope: effectiveScope,
        userId: requestedMemberId,
      );

      if (_isStaleListRequest(wsId, requestToken)) {
        return;
      }

      final nextMemberId = _resolveSelectedMemberId(
        scope: effectiveScope,
        requestedMemberId: requestedMemberId,
        response: response,
      );

      final nextTrackerId = _resolveSelectedTrackerId(
        requestedTrackerId: state.selectedTrackerId,
        trackers: response.trackers,
        searchQuery: state.searchQuery,
      );

      final nextState = state.copyWith(
        status: HabitsStatus.loaded,
        isFromCache: false,
        isRefreshing: false,
        lastUpdatedAt: DateTime.now(),
        listResponse: response,
        selectedScope: effectiveScope,
        selectedMemberId: nextMemberId,
        selectedTrackerId: nextTrackerId,
        error: null,
      );
      emit(nextState);
      _storeCache(nextState);

      if (effectiveScope == HabitTrackerScope.member &&
          nextMemberId != previousMemberId &&
          nextMemberId != null) {
        await loadWorkspace(
          wsId,
          refresh: true,
          scopeOverride: effectiveScope,
        );
        return;
      }

      if (nextTrackerId != null) {
        await loadTrackerDetail(nextTrackerId);
      } else {
        final nextState = state.copyWith(
          detailStatus: HabitsStatus.initial,
          isDetailFromCache: false,
          isDetailRefreshing: false,
          detailLastUpdatedAt: null,
          detail: null,
          detailError: null,
          detailScope: null,
          detailScopeUserId: null,
          activityStatus: HabitsStatus.initial,
          isActivityFromCache: false,
          isActivityRefreshing: false,
          activityLastUpdatedAt: null,
          activityEntries: const [],
          activityError: null,
        );
        emit(nextState);
        _storeCache(nextState);
      }
    } on Exception catch (error) {
      if (_isStaleListRequest(wsId, requestToken)) {
        return;
      }

      emit(
        state.copyWith(
          status: hasVisibleData ? HabitsStatus.loaded : HabitsStatus.error,
          isRefreshing: false,
          error: hasVisibleData ? null : error.toString(),
          listResponse: hasVisibleData ? state.listResponse : null,
          selectedTrackerId: hasVisibleData ? state.selectedTrackerId : null,
          detail: hasVisibleData ? state.detail : null,
          detailStatus: hasVisibleData
              ? state.detailStatus
              : HabitsStatus.initial,
          detailScope: hasVisibleData ? state.detailScope : null,
          detailScopeUserId: hasVisibleData ? state.detailScopeUserId : null,
          activityStatus: hasVisibleData
              ? state.activityStatus
              : HabitsStatus.initial,
          activityEntries: hasVisibleData ? state.activityEntries : const [],
          activityError: hasVisibleData ? state.activityError : null,
        ),
      );
    }
  }

  Future<void> loadActivity({bool refresh = false}) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    final cacheKey = _cacheKeyFor(
      wsId,
      state.selectedScope,
      _scopeUserIdFor(state.selectedScope, state),
    );
    final cached = _cache[cacheKey];
    final hasVisibleEntries =
        state.activityEntries.isNotEmpty ||
        state.activityStatus == HabitsStatus.loaded;

    if (cached != null && !hasVisibleEntries) {
      emit(_applyCachedActivityState(state, cached.state, cached.fetchedAt));
      if (!refresh &&
          cached.state.activityStatus == HabitsStatus.loaded &&
          isHabitsCacheFresh(cached.fetchedAt)) {
        return;
      }
    }

    if (!refresh &&
        state.activityStatus == HabitsStatus.loaded &&
        cached != null &&
        isHabitsCacheFresh(cached.fetchedAt)) {
      return;
    }
    if (state.listResponse == null) {
      await loadWorkspace(wsId, refresh: refresh);
      if (state.listResponse == null) {
        return;
      }
    }

    final requestToken = ++_activityRequestToken;
    final activityScope = state.selectedScope;
    final activityUserId = activityScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;

    emit(
      state.copyWith(
        activityStatus: hasVisibleEntries
            ? HabitsStatus.loaded
            : HabitsStatus.loading,
        isActivityRefreshing: hasVisibleEntries,
        activityError: null,
      ),
    );

    try {
      final trackers = state.trackers;
      if (trackers.isEmpty) {
        emit(
          state.copyWith(
            activityStatus: HabitsStatus.loaded,
            isActivityFromCache: false,
            isActivityRefreshing: false,
            activityLastUpdatedAt: DateTime.now(),
            activityEntries: const [],
            activityError: null,
          ),
        );
        return;
      }

      final details = await Future.wait(
        trackers.map(
          (summary) => _repository.getTrackerDetail(
            wsId,
            summary.tracker.id,
            scope: activityScope,
            userId: activityUserId,
          ),
        ),
      );

      if (_isStaleActivityRequest(
        wsId,
        requestToken,
        activityScope,
        activityUserId,
      )) {
        return;
      }

      final entries =
          details
              .expand(
                (detail) => detail.entries.map(
                  (entry) => HabitActivityEntry(
                    tracker: detail.tracker,
                    entry: entry,
                  ),
                ),
              )
              .toList(growable: false)
            ..sort((left, right) => right.timestamp.compareTo(left.timestamp));

      final nextState = state.copyWith(
        activityStatus: HabitsStatus.loaded,
        isActivityFromCache: false,
        isActivityRefreshing: false,
        activityLastUpdatedAt: DateTime.now(),
        activityEntries: entries,
        activityError: null,
      );
      emit(nextState);
      _storeCache(nextState);
    } on Exception catch (error) {
      if (_isStaleActivityRequest(
        wsId,
        requestToken,
        activityScope,
        activityUserId,
      )) {
        return;
      }

      emit(
        state.copyWith(
          activityStatus: hasVisibleEntries
              ? HabitsStatus.loaded
              : HabitsStatus.error,
          isActivityRefreshing: false,
          activityError: hasVisibleEntries ? null : error.toString(),
        ),
      );
    }
  }

  Future<void> loadTrackerDetail(
    String trackerId, {
    bool refresh = false,
  }) async {
    final wsId = state.activeWorkspaceId;
    final detailScope = state.selectedScope;
    final detailScopeUserId = detailScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    if (!refresh &&
        state.detailStatus == HabitsStatus.loaded &&
        state.detail?.tracker.id == trackerId &&
        state.detailScope == detailScope &&
        state.detailScopeUserId == detailScopeUserId) {
      emit(state.copyWith(selectedTrackerId: trackerId));
      return;
    }

    final cacheKey = _cacheKeyFor(wsId, detailScope, detailScopeUserId);
    final cached = _cache[cacheKey];
    final hasVisibleDetail =
        state.detail?.tracker.id == trackerId &&
        state.detailScope == detailScope &&
        state.detailScopeUserId == detailScopeUserId &&
        state.detailStatus == HabitsStatus.loaded;

    if (cached != null && !hasVisibleDetail) {
      final cachedDetail = cached.state.detail;
      if (cachedDetail?.tracker.id == trackerId &&
          cached.state.detailScope == detailScope &&
          cached.state.detailScopeUserId == detailScopeUserId) {
        emit(_applyCachedDetailState(state, cached.state, cached.fetchedAt));
        if (!refresh && isHabitsCacheFresh(cached.fetchedAt)) {
          return;
        }
      }
    }

    final requestToken = ++_detailRequestToken;
    emit(
      state.copyWith(
        selectedTrackerId: trackerId,
        detailStatus: hasVisibleDetail
            ? HabitsStatus.loaded
            : HabitsStatus.loading,
        isDetailRefreshing: hasVisibleDetail,
        detailError: null,
      ),
    );

    try {
      final detail = await _repository.getTrackerDetail(
        wsId,
        trackerId,
        scope: detailScope,
        userId: detailScopeUserId,
      );

      if (_isStaleDetailRequest(wsId, trackerId, requestToken)) {
        return;
      }

      final nextState = state.copyWith(
        detail: detail,
        detailStatus: HabitsStatus.loaded,
        isDetailFromCache: false,
        isDetailRefreshing: false,
        detailLastUpdatedAt: DateTime.now(),
        detailError: null,
        detailScope: detailScope,
        detailScopeUserId: detailScopeUserId,
      );
      emit(nextState);
      _storeCache(nextState);
    } on Exception catch (error) {
      if (_isStaleDetailRequest(wsId, trackerId, requestToken)) {
        return;
      }
      emit(
        state.copyWith(
          detailStatus: hasVisibleDetail
              ? HabitsStatus.loaded
              : HabitsStatus.error,
          isDetailRefreshing: false,
          detailError: hasVisibleDetail ? null : error.toString(),
        ),
      );
    }
  }

  Future<void> setScope(HabitTrackerScope scope) async {
    if (state.selectedScope == scope) {
      return;
    }
    emit(
      state.copyWith(
        selectedScope: scope,
        selectedMemberId: scope == HabitTrackerScope.member
            ? state.selectedMemberId
            : null,
      ),
    );
    final wsId = state.activeWorkspaceId;
    if (wsId != null && wsId.isNotEmpty) {
      await loadWorkspace(wsId, refresh: true);
    }
  }

  Future<void> setSelectedMember(String? userId) async {
    if (state.selectedMemberId == userId) {
      return;
    }
    emit(state.copyWith(selectedMemberId: userId));
    final wsId = state.activeWorkspaceId;
    if (wsId != null && wsId.isNotEmpty) {
      await loadWorkspace(wsId, refresh: true);
    }
  }

  Future<void> selectTracker(String trackerId) async {
    final detailScopeUserId = state.selectedScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (trackerId == state.selectedTrackerId &&
        state.detail?.tracker.id == trackerId &&
        state.detailStatus == HabitsStatus.loaded &&
        state.detailScope == state.selectedScope &&
        state.detailScopeUserId == detailScopeUserId) {
      return;
    }

    await loadTrackerDetail(trackerId);
  }

  void setSearchQuery(String value) {
    final nextTrackerId = _resolveSelectedTrackerId(
      requestedTrackerId: state.selectedTrackerId,
      trackers: state.trackers,
      searchQuery: value,
    );

    final nextState = state.copyWith(
      searchQuery: value,
      selectedTrackerId: nextTrackerId,
    );
    emit(nextState);
    _storeCache(nextState);
  }

  void setQuickLogDraft(String trackerId, String value) {
    final drafts = <String, String>{...state.quickLogDrafts, trackerId: value};
    final nextState = state.copyWith(quickLogDrafts: drafts);
    emit(nextState);
    _storeCache(nextState);
  }

  Future<void> createTracker(HabitTrackerInput input) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.createTracker(wsId, input);
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      emit(state.copyWith(isSubmittingTracker: false));
    }
  }

  Future<void> updateTracker(String trackerId, HabitTrackerInput input) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.updateTracker(wsId, trackerId, input);
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      emit(state.copyWith(isSubmittingTracker: false));
    }
  }

  Future<void> archiveTracker(String trackerId) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isArchivingTracker: true, error: null));
    try {
      await _repository.archiveTracker(wsId, trackerId);
      final nextTrackers = state.trackers
          .where((value) => value.tracker.id != trackerId)
          .toList(growable: false);
      final nextTrackerId = nextTrackers.isEmpty
          ? null
          : nextTrackers.first.tracker.id;
      await _reloadAfterMutation(selectTrackerId: nextTrackerId);
    } finally {
      emit(state.copyWith(isArchivingTracker: false));
    }
  }

  Future<void> createEntry(
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      final entry = await _repository.createEntry(wsId, trackerId, input);
      final drafts = <String, String>{...state.quickLogDrafts}
        ..remove(trackerId);
      var nextState = state.copyWith(quickLogDrafts: drafts);
      nextState = _applyCreatedEntryLocally(nextState, trackerId, entry);
      final now = DateTime.now();
      nextState = nextState.copyWith(
        lastUpdatedAt: now,
        detailLastUpdatedAt: nextState.detail == null ? null : now,
        activityLastUpdatedAt: nextState.activityEntries.isEmpty ? null : now,
      );
      emit(nextState);
      _storeCache(nextState);
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingEntry: false));
    }
  }

  Future<void> deleteEntry(String trackerId, String entryId) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      await _repository.deleteEntry(wsId, trackerId, entryId);
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingEntry: false));
    }
  }

  Future<void> createStreakAction(
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingStreakAction: true, error: null));
    try {
      await _repository.createStreakAction(wsId, trackerId, input);
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingStreakAction: false));
    }
  }

  Future<void> _reloadAfterMutation({String? selectTrackerId}) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    final shouldRefreshActivity =
        state.activityStatus != HabitsStatus.initial ||
        state.activityEntries.isNotEmpty;

    final nextState = state.copyWith(selectedTrackerId: selectTrackerId);
    emit(nextState);
    _storeCache(nextState);
    await loadWorkspace(wsId, refresh: true);
    if (selectTrackerId != null) {
      await loadTrackerDetail(selectTrackerId, refresh: true);
    }
    if (shouldRefreshActivity) {
      await loadActivity(refresh: true);
    }
  }

  bool _isStaleListRequest(String wsId, int requestToken) {
    return state.activeWorkspaceId != wsId || requestToken != _listRequestToken;
  }

  bool _isStaleDetailRequest(String wsId, String trackerId, int requestToken) {
    return state.activeWorkspaceId != wsId ||
        state.selectedTrackerId != trackerId ||
        requestToken != _detailRequestToken;
  }

  bool _isStaleActivityRequest(
    String wsId,
    int requestToken,
    HabitTrackerScope scope,
    String? userId,
  ) {
    if (state.activeWorkspaceId != wsId ||
        requestToken != _activityRequestToken) {
      return true;
    }
    if (state.selectedScope != scope) {
      return true;
    }
    if (scope == HabitTrackerScope.member && state.selectedMemberId != userId) {
      return true;
    }
    return false;
  }

  static String? _scopeUserIdFor(HabitTrackerScope scope, HabitsState state) {
    return scope == HabitTrackerScope.member ? state.selectedMemberId : null;
  }

  static String _cacheKeyFor(
    String wsId,
    HabitTrackerScope scope,
    String? userId,
  ) {
    return userScopedCacheKey('$wsId::${scope.apiValue}::${userId ?? ''}');
  }

  HabitsState _applyCreatedEntryLocally(
    HabitsState currentState,
    String trackerId,
    HabitTrackerEntry entry,
  ) {
    final listResponse = currentState.listResponse;
    if (listResponse == null) {
      return currentState;
    }

    final trackerIndex = listResponse.trackers.indexWhere(
      (value) => value.tracker.id == trackerId,
    );
    if (trackerIndex < 0) {
      return currentState;
    }

    final summary = listResponse.trackers[trackerIndex];
    final nextSummary = _patchSummaryWithEntry(
      currentState,
      listResponse,
      summary,
      entry,
    );
    final nextTrackers = [...listResponse.trackers];
    nextTrackers[trackerIndex] = nextSummary;

    var nextState = currentState.copyWith(
      listResponse: listResponse.copyWith(trackers: nextTrackers),
    );

    if (currentState.detail?.tracker.id == trackerId) {
      final detail = currentState.detail!;
      final nextEntries = [
        entry,
        ...detail.entries.where((value) => value.id != entry.id),
      ];
      nextState = nextState.copyWith(
        detail: detail.copyWith(
          entries: nextEntries,
          currentMember: nextSummary.currentMember,
          team: nextSummary.team,
        ),
      );
    }

    if (currentState.activityStatus != HabitsStatus.initial ||
        currentState.activityEntries.isNotEmpty) {
      final tracker = nextSummary.tracker;
      final nextActivityEntries = [
        HabitActivityEntry(tracker: tracker, entry: entry),
        ...currentState.activityEntries.where(
          (value) => value.entry.id != entry.id,
        ),
      ]..sort((left, right) => right.timestamp.compareTo(left.timestamp));
      nextState = nextState.copyWith(
        activityStatus: HabitsStatus.loaded,
        activityEntries: nextActivityEntries,
      );
    }

    return nextState;
  }

  HabitTrackerCardSummary _patchSummaryWithEntry(
    HabitsState currentState,
    HabitTrackerListResponse listResponse,
    HabitTrackerCardSummary summary,
    HabitTrackerEntry entry,
  ) {
    final tracker = summary.tracker;
    final entryValue = _primaryEntryValue(tracker, entry);
    final affectsCurrentPeriod = _entryAffectsCurrentPeriod(tracker, entry);
    final memberSummary =
        summary.currentMember ??
        _buildFallbackCurrentMember(currentState, listResponse, entry);

    final nextCurrentMember = memberSummary == null
        ? null
        : _patchCurrentMemberSummary(
            memberSummary,
            tracker,
            entry,
            entryValue,
            affectsCurrentPeriod,
          );
    final previousCurrentPeriod =
        summary.currentMember?.currentPeriodTotal ?? 0;
    final nextCurrentPeriod = nextCurrentMember?.currentPeriodTotal ?? 0;
    final nextTeam = summary.team == null
        ? null
        : _patchTeamSummary(
            summary.team!,
            entryValue,
            previousCurrentPeriod: previousCurrentPeriod,
            nextCurrentPeriod: nextCurrentPeriod,
          );

    return summary.copyWith(
      currentMember: nextCurrentMember,
      team: nextTeam,
    );
  }

  HabitTrackerMemberSummary? _buildFallbackCurrentMember(
    HabitsState currentState,
    HabitTrackerListResponse listResponse,
    HabitTrackerEntry entry,
  ) {
    final targetUserId = currentState.selectedScope == HabitTrackerScope.member
        ? currentState.selectedMemberId
        : listResponse.viewerUserId;
    if (targetUserId == null || targetUserId.isEmpty) {
      return null;
    }

    HabitTrackerMember? member;
    for (final value in listResponse.members) {
      if (value.userId == targetUserId) {
        member = value;
        break;
      }
    }
    member ??= entry.member != null && entry.member!.userId == targetUserId
        ? entry.member
        : null;
    member ??= HabitTrackerMember(userId: targetUserId, displayName: 'You');

    return HabitTrackerMemberSummary(
      member: member,
      total: 0,
      entryCount: 0,
      currentPeriodTotal: 0,
      streak: const HabitTrackerStreakSummary(
        currentStreak: 0,
        bestStreak: 0,
        freezeCount: 0,
        freezesUsed: 0,
        perfectWeekCount: 0,
        consistencyRate: 0,
        recoveryWindow: HabitTrackerRecoveryWindowState(eligible: false),
      ),
    );
  }

  HabitTrackerMemberSummary _patchCurrentMemberSummary(
    HabitTrackerMemberSummary summary,
    HabitTracker tracker,
    HabitTrackerEntry entry,
    double entryValue,
    bool affectsCurrentPeriod,
  ) {
    final nextTotal = _applyAggregation(
      currentValue: summary.total,
      entryValue: entryValue,
      strategy: tracker.aggregationStrategy,
    );
    final nextCurrentPeriod = affectsCurrentPeriod
        ? _applyAggregation(
            currentValue: summary.currentPeriodTotal,
            entryValue: entryValue,
            strategy: tracker.aggregationStrategy,
          )
        : summary.currentPeriodTotal;

    return summary.copyWith(
      total: nextTotal,
      entryCount: summary.entryCount + 1,
      currentPeriodTotal: nextCurrentPeriod,
      latestValue: entryValue,
      latestEntryId: entry.id,
      latestEntryDate: entry.entryDate,
      latestOccurredAt: entry.occurredAt ?? entry.createdAt,
      latestValues: entry.values,
    );
  }

  HabitTrackerTeamSummary _patchTeamSummary(
    HabitTrackerTeamSummary summary,
    double entryValue, {
    required double previousCurrentPeriod,
    required double nextCurrentPeriod,
  }) {
    final delta = nextCurrentPeriod - previousCurrentPeriod;
    return summary.copyWith(
      totalEntries: summary.totalEntries + 1,
      totalValue: summary.totalValue + delta,
    );
  }

  double _primaryEntryValue(HabitTracker tracker, HabitTrackerEntry entry) {
    if (entry.primaryValue != null) {
      return entry.primaryValue!;
    }

    final rawValue = entry.values[tracker.primaryMetricKey];
    if (rawValue is num) {
      return rawValue.toDouble();
    }
    if (rawValue is bool) {
      return rawValue ? 1 : 0;
    }
    return 0;
  }

  bool _entryAffectsCurrentPeriod(
    HabitTracker tracker,
    HabitTrackerEntry entry,
  ) {
    final entryDate = DateTime.tryParse(entry.entryDate);
    if (entryDate == null) {
      return false;
    }

    final now = DateTime.now();
    final current = DateTime(now.year, now.month, now.day);
    final candidate = DateTime(entryDate.year, entryDate.month, entryDate.day);

    switch (tracker.targetPeriod) {
      case HabitTrackerTargetPeriod.daily:
        return candidate == current;
      case HabitTrackerTargetPeriod.weekly:
        final startOfWeek = current.subtract(
          Duration(days: current.weekday - DateTime.monday),
        );
        final endOfWeek = startOfWeek.add(const Duration(days: 6));
        return !candidate.isBefore(startOfWeek) &&
            !candidate.isAfter(endOfWeek);
    }
  }

  double _applyAggregation({
    required double currentValue,
    required double entryValue,
    required HabitTrackerAggregationStrategy strategy,
  }) {
    return switch (strategy) {
      HabitTrackerAggregationStrategy.max =>
        entryValue > currentValue ? entryValue : currentValue,
      HabitTrackerAggregationStrategy.countEntries => currentValue + 1,
      HabitTrackerAggregationStrategy.booleanAny =>
        (currentValue > 0 || entryValue > 0) ? 1 : 0,
      HabitTrackerAggregationStrategy.sum => currentValue + entryValue,
    };
  }

  void _storeCache(HabitsState nextState) {
    final wsId = nextState.activeWorkspaceId;
    final listResponse = nextState.listResponse;
    if (wsId == null || wsId.isEmpty || listResponse == null) {
      return;
    }

    final cacheKey = _cacheKeyFor(
      wsId,
      nextState.selectedScope,
      _scopeUserIdFor(nextState.selectedScope, nextState),
    );
    _cache[cacheKey] = _HabitsCacheEntry(
      state: nextState,
      fetchedAt: DateTime.now(),
    );
    _latestCacheKeyByWorkspace[userScopedCacheKey(wsId)] = cacheKey;
    unawaited(
      CacheStore.instance
          .write(
            key: _storeKey(
              wsId,
              nextState.selectedScope,
              _scopeUserIdFor(nextState.selectedScope, nextState),
            ),
            policy: _cachePolicy,
            payload: _stateToCacheJson(nextState),
            tags: [_cacheTag, 'workspace:$wsId', 'module:habits'],
          )
          .catchError((Object error, StackTrace stackTrace) {
            developer.log(
              'Failed to cache habits state for workspace $wsId: $error',
              stackTrace: stackTrace,
            );
          }),
    );
  }

  HabitsState _decorateCachedState(
    HabitsState cachedState, {
    DateTime? fetchedAt,
  }) {
    return cachedState.copyWith(
      status: cachedState.listResponse == null
          ? cachedState.status
          : HabitsStatus.loaded,
      detailStatus: cachedState.detail == null
          ? cachedState.detailStatus
          : HabitsStatus.loaded,
      activityStatus:
          cachedState.activityEntries.isNotEmpty ||
              cachedState.activityStatus == HabitsStatus.loaded
          ? HabitsStatus.loaded
          : cachedState.activityStatus,
      isFromCache: true,
      isRefreshing: false,
      lastUpdatedAt: cachedState.lastUpdatedAt ?? fetchedAt,
      isDetailFromCache: cachedState.detail != null,
      isDetailRefreshing: false,
      detailLastUpdatedAt: cachedState.detail == null
          ? null
          : (cachedState.detailLastUpdatedAt ?? fetchedAt),
      isActivityFromCache:
          cachedState.activityEntries.isNotEmpty ||
          cachedState.activityStatus == HabitsStatus.loaded,
      isActivityRefreshing: false,
      activityLastUpdatedAt:
          cachedState.activityEntries.isEmpty &&
              cachedState.activityStatus != HabitsStatus.loaded
          ? null
          : (cachedState.activityLastUpdatedAt ?? fetchedAt),
      error: null,
      detailError: null,
      activityError: null,
    );
  }

  HabitsState _applyCachedActivityState(
    HabitsState currentState,
    HabitsState cachedState,
    DateTime? fetchedAt,
  ) {
    return currentState.copyWith(
      activityStatus:
          cachedState.activityEntries.isNotEmpty ||
              cachedState.activityStatus == HabitsStatus.loaded
          ? HabitsStatus.loaded
          : currentState.activityStatus,
      activityEntries: cachedState.activityEntries,
      isActivityFromCache:
          cachedState.activityEntries.isNotEmpty ||
          cachedState.activityStatus == HabitsStatus.loaded,
      isActivityRefreshing: false,
      activityLastUpdatedAt: cachedState.activityLastUpdatedAt ?? fetchedAt,
      activityError: null,
    );
  }

  HabitsState _applyCachedDetailState(
    HabitsState currentState,
    HabitsState cachedState,
    DateTime? fetchedAt,
  ) {
    return currentState.copyWith(
      detail: cachedState.detail,
      detailStatus: cachedState.detail == null
          ? currentState.detailStatus
          : HabitsStatus.loaded,
      isDetailFromCache: cachedState.detail != null,
      isDetailRefreshing: false,
      detailLastUpdatedAt: cachedState.detailLastUpdatedAt ?? fetchedAt,
      detailError: null,
      detailScope: cachedState.detailScope,
      detailScopeUserId: cachedState.detailScopeUserId,
    );
  }

  String? _resolveSelectedMemberId({
    required HabitTrackerScope scope,
    required String? requestedMemberId,
    required HabitTrackerListResponse response,
  }) {
    if (scope != HabitTrackerScope.member) {
      return null;
    }
    if (response.members.isEmpty) {
      return null;
    }
    if (requestedMemberId != null &&
        response.members.any((value) => value.userId == requestedMemberId)) {
      return requestedMemberId;
    }
    return response.members.first.userId;
  }

  String? _resolveSelectedTrackerId({
    required String? requestedTrackerId,
    required List<HabitTrackerCardSummary> trackers,
    required String searchQuery,
  }) {
    if (trackers.isEmpty) {
      return null;
    }
    final filtered = _filterTrackers(trackers, searchQuery);
    final visibleTrackers = filtered.isEmpty ? trackers : filtered;
    if (requestedTrackerId != null &&
        visibleTrackers.any(
          (value) => value.tracker.id == requestedTrackerId,
        )) {
      return requestedTrackerId;
    }
    return visibleTrackers.first.tracker.id;
  }

  List<HabitTrackerCardSummary> _filterTrackers(
    List<HabitTrackerCardSummary> trackers,
    String searchQuery,
  ) {
    final query = searchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return trackers;
    }
    return trackers
        .where((tracker) {
          final name = tracker.tracker.name.toLowerCase();
          final description = (tracker.tracker.description ?? '').toLowerCase();
          return name.contains(query) || description.contains(query);
        })
        .toList(growable: false);
  }
}

class _HabitsCacheEntry {
  const _HabitsCacheEntry({
    required this.state,
    required this.fetchedAt,
  });

  final HabitsState state;
  final DateTime fetchedAt;
}
