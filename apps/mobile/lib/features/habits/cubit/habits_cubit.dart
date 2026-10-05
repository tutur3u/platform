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

part 'habits_cache_json.dart';
part 'habits_cubit_loading.dart';
part 'habits_cubit_mutations.dart';
part 'habits_cubit_optimistic.dart';

class HabitsCubit extends Cubit<HabitsState> {
  HabitsCubit({
    required IHabitTrackerRepository repository,
    HabitsState? initialState,
    String? actorId,
    String? Function()? currentUserId,
    CacheStore? cacheStore,
  }) : _repository = repository,
       _ownerId = actorId ?? (currentUserId ?? currentCacheUserId)(),
       _currentUserId = currentUserId ?? currentCacheUserId,
       _store = cacheStore ?? CacheStore.instance,
       _requestedWorkspaceId = initialState?.activeWorkspaceId,
       super(initialState ?? const HabitsState()) {
    _ownerCacheRevision = _store.resourceRevisionFor(_actorFenceKey);
  }

  final IHabitTrackerRepository _repository;
  final String? _ownerId;
  final String? Function() _currentUserId;
  final CacheStore _store;
  late final int _ownerCacheRevision;
  CacheKey get _actorFenceKey =>
      CacheKey(namespace: 'habits.actor', userId: _ownerId);
  bool get _scopeActive =>
      !isClosed &&
      _currentUserId() == _ownerId &&
      _store.resourceRevisionFor(_actorFenceKey) == _ownerCacheRevision;
  void _checkScope() {
    if (!_scopeActive) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
  }

  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'habits:workspace';
  static final Map<String, _HabitsCacheEntry> _cache = {};
  static final Map<String, String> _latestCacheKeyByWorkspace = {};
  String? _requestedWorkspaceId;
  int _workspaceEpoch = 0;
  int _listRequestToken = 0;
  int _detailRequestToken = 0;
  int _activityRequestToken = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid habits cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static HabitsState? cachedStateForWorkspace(String wsId, {String? actorId}) {
    final key =
        _latestCacheKeyByWorkspace[userScopedCacheKey(wsId, userId: actorId)];
    if (key == null) {
      return null;
    }
    return _cache[key]?.state;
  }

  static CacheKey _storeKey(
    String wsId,
    HabitTrackerScope scope,
    String? userId, {
    required String? actorId,
  }) {
    return CacheKey(
      namespace: 'habits.workspace',
      userId: actorId,
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
    String? actorId,
  }) {
    final owner = actorId ?? currentCacheUserId();
    final cached = CacheStore.instance.peek<HabitsState>(
      key: _storeKey(wsId, initialScope, userId, actorId: owner),
      decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
    );
    if (!cached.hasValue || cached.data == null) {
      return cachedStateForWorkspace(wsId, actorId: owner);
    }

    final cacheKey = _cacheKeyFor(wsId, initialScope, userId, actorId: owner);
    _cache[cacheKey] = _HabitsCacheEntry(
      state: cached.data!,
      fetchedAt: cached.fetchedAt ?? DateTime.now(),
    );
    _latestCacheKeyByWorkspace['${owner ?? 'anonymous'}::$wsId'] = cacheKey;
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
    final actorId = currentCacheUserId();
    final fence = CacheKey(namespace: 'habits.actor', userId: actorId);
    final ownerRevision = CacheStore.instance.resourceRevisionFor(fence);
    void checkScope() {
      if (currentCacheUserId() != actorId ||
          CacheStore.instance.resourceRevisionFor(fence) != ownerRevision) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
    }

    final scopeUserId = scope == HabitTrackerScope.member ? userId : null;
    try {
      await CacheStore.instance.prefetch<HabitsState>(
        key: _storeKey(wsId, scope, scopeUserId, actorId: actorId),
        policy: _cachePolicy,
        decode: (json) => _stateFromCacheJson(_decodeCacheJson(json)),
        forceRefresh: forceRefresh,
        checkScope: checkScope,
        tags: [_cacheTag, 'workspace:$wsId', 'module:habits'],
        fetch: () async {
          checkScope();
          final response = await repository.listTrackers(
            wsId,
            scope: scope,
            userId: scopeUserId,
          );
          checkScope();
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

          checkScope();
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

  void _publish(HabitsState nextState) {
    if (_scopeActive) emit(nextState);
  }

  Future<void> loadWorkspace(
    String wsId, {
    bool refresh = false,
    HabitTrackerScope? scopeOverride,
  }) => _loadWorkspace(wsId, refresh: refresh, scopeOverride: scopeOverride);
  Future<void> loadActivity({bool refresh = false}) =>
      _loadActivity(refresh: refresh);
  Future<void> loadTrackerDetail(String trackerId, {bool refresh = false}) =>
      _loadTrackerDetail(trackerId, refresh: refresh);
  Future<void> createTracker(HabitTrackerInput input) => _createTracker(input);
  Future<void> updateTracker(String trackerId, HabitTrackerInput input) =>
      _updateTracker(trackerId, input);
  Future<void> archiveTracker(String trackerId) => _archiveTracker(trackerId);
  Future<void> createEntry(String trackerId, HabitTrackerEntryInput input) =>
      _createEntry(trackerId, input);
  Future<void> deleteEntry(String trackerId, String entryId) =>
      _deleteEntry(trackerId, entryId);
  Future<void> createStreakAction(
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) => _createStreakAction(trackerId, input);

  bool _isStaleListRequest(String wsId, int requestToken) {
    return !_scopeActive ||
        _requestedWorkspaceId != wsId ||
        state.activeWorkspaceId != wsId ||
        requestToken != _listRequestToken;
  }

  bool _isStaleDetailRequest(String wsId, String trackerId, int requestToken) {
    return !_scopeActive ||
        _requestedWorkspaceId != wsId ||
        state.activeWorkspaceId != wsId ||
        state.selectedTrackerId != trackerId ||
        requestToken != _detailRequestToken;
  }

  bool _isStaleActivityRequest(
    String wsId,
    int requestToken,
    HabitTrackerScope scope,
    String? userId,
  ) {
    if (!_scopeActive ||
        state.activeWorkspaceId != wsId ||
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
    String? userId, {
    required String? actorId,
  }) {
    final partition = actorId ?? 'anonymous';
    return '$partition::$wsId::${scope.apiValue}::${userId ?? ''}';
  }

  void _storeCache(HabitsState nextState) {
    if (!_scopeActive) return;
    final wsId = nextState.activeWorkspaceId;
    final listResponse = nextState.listResponse;
    if (wsId == null || wsId.isEmpty || listResponse == null) {
      return;
    }

    final epoch = _workspaceEpoch;
    void checkPublication() {
      _checkScope();
      if (epoch != _workspaceEpoch || _requestedWorkspaceId != wsId) {
        throw const ApiException(
          message: 'Workspace changed',
          statusCode: 0,
          failureKind: ApiFailureKind.session,
        );
      }
    }

    final cacheKey = _cacheKeyFor(
      wsId,
      nextState.selectedScope,
      _scopeUserIdFor(nextState.selectedScope, nextState),
      actorId: _ownerId,
    );
    _cache[cacheKey] = _HabitsCacheEntry(
      state: nextState,
      fetchedAt: DateTime.now(),
    );
    _latestCacheKeyByWorkspace['${_ownerId ?? 'anonymous'}::$wsId'] = cacheKey;
    unawaited(
      _store
          .write(
            key: _storeKey(
              wsId,
              nextState.selectedScope,
              _scopeUserIdFor(nextState.selectedScope, nextState),
              actorId: _ownerId,
            ),
            checkScope: checkPublication,
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
  const _HabitsCacheEntry({required this.state, required this.fetchedAt});

  final HabitsState state;
  final DateTime fetchedAt;
}
