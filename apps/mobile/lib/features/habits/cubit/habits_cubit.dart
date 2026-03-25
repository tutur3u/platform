import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habits_cache.dart';

class HabitsCubit extends Cubit<HabitsState> {
  HabitsCubit({
    required IHabitTrackerRepository repository,
    HabitsState? initialState,
  }) : _repository = repository,
       super(initialState ?? const HabitsState());

  final IHabitTrackerRepository _repository;
  static final Map<String, _HabitsCacheEntry> _cache = {};
  static final Map<String, String> _latestCacheKeyByWorkspace = {};
  int _listRequestToken = 0;
  int _detailRequestToken = 0;
  int _activityRequestToken = 0;

  static HabitsState? cachedStateForWorkspace(String wsId) {
    final key = _latestCacheKeyByWorkspace[wsId];
    if (key == null) {
      return null;
    }
    return _cache[key]?.state;
  }

  static void clearCache() {
    _cache.clear();
    _latestCacheKeyByWorkspace.clear();
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
    var hasVisibleData =
        isSameWorkspace &&
        state.listResponse != null &&
        effectiveScope == state.selectedScope &&
        requestedMemberId == _scopeUserIdFor(effectiveScope, state);

    if (cached != null && !hasVisibleData) {
      emit(cached.state);
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
          status: HabitsStatus.loading,
          activeWorkspaceId: wsId,
          selectedScope: effectiveScope,
          selectedMemberId: requestedMemberId,
          error: null,
          detailError: null,
          activityError: null,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: HabitsStatus.loading,
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
          detail: null,
          detailError: null,
          detailScope: null,
          detailScopeUserId: null,
          activityStatus: HabitsStatus.initial,
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
      emit(cached.state);
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
        activityStatus: HabitsStatus.loading,
        activityError: null,
      ),
    );

    try {
      final trackers = state.trackers;
      if (trackers.isEmpty) {
        emit(
          state.copyWith(
            activityStatus: HabitsStatus.loaded,
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
          activityStatus: HabitsStatus.error,
          activityError: error.toString(),
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

    final requestToken = ++_detailRequestToken;
    emit(
      state.copyWith(
        selectedTrackerId: trackerId,
        detailStatus: HabitsStatus.loading,
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
          detailStatus: HabitsStatus.error,
          detailError: error.toString(),
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
      await _repository.createEntry(wsId, trackerId, input);
      final drafts = <String, String>{...state.quickLogDrafts}
        ..remove(trackerId);
      emit(state.copyWith(quickLogDrafts: drafts));
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
    return '$wsId::${scope.apiValue}::${userId ?? ''}';
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
    _latestCacheKeyByWorkspace[wsId] = cacheKey;
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
