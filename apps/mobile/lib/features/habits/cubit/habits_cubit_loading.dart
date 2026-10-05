part of 'habits_cubit.dart';

extension _HabitsLoading on HabitsCubit {
  Future<void> _loadWorkspace(
    String wsId, {
    bool refresh = false,
    HabitTrackerScope? scopeOverride,
  }) async {
    if (!_scopeActive) return;
    if (_requestedWorkspaceId != wsId) {
      _requestedWorkspaceId = wsId;
      _workspaceEpoch++;
    }
    final requestToken = ++_listRequestToken;
    final isSameWorkspace = state.activeWorkspaceId == wsId;
    final effectiveScope = scopeOverride ?? state.selectedScope;
    final requestedMemberId = effectiveScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    final cacheKey = HabitsCubit._cacheKeyFor(
      wsId,
      effectiveScope,
      requestedMemberId,
      actorId: _ownerId,
    );
    final cached = HabitsCubit._cache[cacheKey];
    final diskCached = cached == null
        ? await _store.read<HabitsState>(
            key: HabitsCubit._storeKey(
              wsId,
              effectiveScope,
              requestedMemberId,
              actorId: _ownerId,
            ),
            decode: (json) =>
                _stateFromCacheJson(HabitsCubit._decodeCacheJson(json)),
          )
        : null;
    if (!_scopeActive || requestToken != _listRequestToken) return;
    var hasVisibleData =
        isSameWorkspace &&
        state.listResponse != null &&
        effectiveScope == state.selectedScope &&
        requestedMemberId == HabitsCubit._scopeUserIdFor(effectiveScope, state);

    if (diskCached?.hasValue == true &&
        diskCached?.data != null &&
        !hasVisibleData) {
      final cachedState = _decorateCachedState(
        diskCached!.data!,
        fetchedAt: diskCached.fetchedAt,
      );
      _publish(cachedState);
      HabitsCubit._cache[cacheKey] = _HabitsCacheEntry(
        state: cachedState,
        fetchedAt: diskCached.fetchedAt ?? DateTime.now(),
      );
      HabitsCubit
              ._latestCacheKeyByWorkspace['${_ownerId ?? 'anonymous'}::$wsId'] =
          cacheKey;
      hasVisibleData = true;
    }

    if (cached != null && !hasVisibleData) {
      _publish(_decorateCachedState(cached.state, fetchedAt: cached.fetchedAt));
      hasVisibleData = true;
    }

    if (hasVisibleData) {
      _publish(
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
      _publish(
        state.copyWith(
          status: HabitsStatus.loading,
          isSubmittingTracker: isSameWorkspace && state.isSubmittingTracker,
          isArchivingTracker: isSameWorkspace && state.isArchivingTracker,
          isSubmittingEntry: isSameWorkspace && state.isSubmittingEntry,
          isSubmittingStreakAction:
              isSameWorkspace && state.isSubmittingStreakAction,
          quickLogDrafts: isSameWorkspace ? state.quickLogDrafts : const {},
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
      _publish(nextState);
      _storeCache(nextState);

      if (effectiveScope == HabitTrackerScope.member &&
          nextMemberId != previousMemberId &&
          nextMemberId != null) {
        await loadWorkspace(wsId, refresh: true, scopeOverride: effectiveScope);
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
        _publish(nextState);
        _storeCache(nextState);
      }
    } on Exception catch (error) {
      if (_isStaleListRequest(wsId, requestToken)) {
        return;
      }

      _publish(
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

  Future<void> _loadActivity({bool refresh = false}) async {
    if (!_scopeActive) return;
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    final cacheKey = HabitsCubit._cacheKeyFor(
      wsId,
      state.selectedScope,
      HabitsCubit._scopeUserIdFor(state.selectedScope, state),
      actorId: _ownerId,
    );
    final cached = HabitsCubit._cache[cacheKey];
    var hasVisibleEntries =
        state.activityEntries.isNotEmpty ||
        state.activityStatus == HabitsStatus.loaded;

    if (cached != null && !hasVisibleEntries) {
      _publish(
        _applyCachedActivityState(state, cached.state, cached.fetchedAt),
      );
      hasVisibleEntries = true;
    }
    if (state.listResponse == null) {
      await loadWorkspace(wsId, refresh: refresh);
      if (!_scopeActive ||
          state.activeWorkspaceId != wsId ||
          state.listResponse == null) {
        return;
      }
    }

    final requestToken = ++_activityRequestToken;
    final activityScope = state.selectedScope;
    final activityUserId = activityScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;

    _publish(
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
        _publish(
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

      if (epoch != _workspaceEpoch ||
          _isStaleActivityRequest(
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
                  (entry) =>
                      HabitActivityEntry(tracker: detail.tracker, entry: entry),
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
      _publish(nextState);
      _storeCache(nextState);
    } on Exception catch (error) {
      if (epoch != _workspaceEpoch ||
          _isStaleActivityRequest(
            wsId,
            requestToken,
            activityScope,
            activityUserId,
          )) {
        return;
      }

      _publish(
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

  Future<void> _loadTrackerDetail(
    String trackerId, {
    bool refresh = false,
  }) async {
    if (!_scopeActive) return;
    final epoch = _workspaceEpoch;
    final wsId = state.activeWorkspaceId;
    final detailScope = state.selectedScope;
    final detailScopeUserId = detailScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    final cacheKey = HabitsCubit._cacheKeyFor(
      wsId,
      detailScope,
      detailScopeUserId,
      actorId: _ownerId,
    );
    final cached = HabitsCubit._cache[cacheKey];
    var hasVisibleDetail =
        state.detail?.tracker.id == trackerId &&
        state.detailScope == detailScope &&
        state.detailScopeUserId == detailScopeUserId &&
        state.detailStatus == HabitsStatus.loaded;

    if (cached != null && !hasVisibleDetail) {
      final cachedDetail = cached.state.detail;
      if (cachedDetail?.tracker.id == trackerId &&
          cached.state.detailScope == detailScope &&
          cached.state.detailScopeUserId == detailScopeUserId) {
        _publish(
          _applyCachedDetailState(state, cached.state, cached.fetchedAt),
        );
        hasVisibleDetail = true;
      }
    }

    final requestToken = ++_detailRequestToken;
    _publish(
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

      if (epoch != _workspaceEpoch ||
          _isStaleDetailRequest(wsId, trackerId, requestToken)) {
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
      _publish(nextState);
      _storeCache(nextState);
    } on Exception catch (error) {
      if (epoch != _workspaceEpoch ||
          _isStaleDetailRequest(wsId, trackerId, requestToken)) {
        return;
      }
      _publish(
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
}
