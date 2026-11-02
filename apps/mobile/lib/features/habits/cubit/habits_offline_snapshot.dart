part of 'habits_cubit.dart';

/// Captures screen account and revocation fences before fetching.
class HabitsOfflineSnapshot {
  HabitsOfflineSnapshot({
    required this.store,
    required String userId,
    required String workspaceId,
    required void Function() checkScope,
    HabitsSnapshotAccess? access,
  }) : key = HabitsCubit._storeKey(
         workspaceId,
         HabitTrackerScope.self,
         null,
         actorId: userId,
       ),
       access = access ?? HabitsSnapshotAccess.shared(store),
       _checkScope = checkScope,
       _actorFence = CacheKey(namespace: 'habits.actor', userId: userId) {
    _accessRevision = this.access.revision(key);
    _actorRevision = store.resourceRevisionFor(_actorFence);
  }
  final CacheStore store;
  final CacheKey key;
  final HabitsSnapshotAccess access;
  final void Function() _checkScope;
  final CacheKey _actorFence;
  late final int _accessRevision;
  late final int _actorRevision;

  void check() {
    _checkScope();
    access.checkRevision(key, _accessRevision);
    if (store.resourceRevisionFor(_actorFence) != _actorRevision) {
      throw const ApiException(
        message: 'Account cache changed',
        statusCode: 401,
      );
    }
  }

  Future<void> revoke(ApiException error) =>
      access.revoke(key, error, _checkScope);

  Future<CacheKey> publish(
    Map<String, dynamic> list,
    List<Map<String, dynamic>> details,
  ) async {
    check();
    final response = HabitTrackerListResponse.fromJson(list);
    final parsed = details.map(HabitTrackerDetailResponse.fromJson).toList();
    final detail = parsed.firstOrNull;
    final now = DateTime.now();
    final activities = [
      for (final item in parsed)
        for (final entry in item.entries)
          HabitActivityEntry(tracker: item.tracker, entry: entry),
    ]..sort((left, right) => right.timestamp.compareTo(left.timestamp));
    final state = HabitsState(
      status: HabitsStatus.loaded,
      activeWorkspaceId: key.workspaceId,
      listResponse: response,
      selectedTrackerId: detail?.tracker.id,
      detail: detail,
      detailScope: HabitTrackerScope.self,
      detailStatus: detail == null ? HabitsStatus.initial : HabitsStatus.loaded,
      activityStatus: HabitsStatus.loaded,
      activityEntries: activities,
      lastUpdatedAt: now,
      detailLastUpdatedAt: now,
      activityLastUpdatedAt: now,
    );
    await access.publish(
      key: key,
      payload: _stateToCacheJson(state),
      policy: CachePolicies.offlineCatalog,
      tags: [
        'habits:workspace',
        'module:habits',
        'workspace:${key.workspaceId}',
      ],
      expectedRevision: _accessRevision,
      checkScope: check,
      authorizedList: true,
    );
    check();
    return key;
  }
}
