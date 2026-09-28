part of 'time_tracker_repository.dart';

extension _TimeTrackerRepositoryGoals on TimeTrackerRepository {
  String _goalsPath(String wsId) =>
      '/api/v1/workspaces/$wsId/time-tracking/goals';

  Map<String, dynamic> _goalPatch(Map<String, dynamic> payload) => {
    if (payload.containsKey('categoryId')) 'category_id': payload['categoryId'],
    if (payload.containsKey('dailyGoalMinutes'))
      'daily_goal_minutes': payload['dailyGoalMinutes'],
    if (payload.containsKey('weeklyGoalMinutes'))
      'weekly_goal_minutes': payload['weeklyGoalMinutes'],
    if (payload.containsKey('isActive')) 'is_active': payload['isActive'],
  };

  TimeTrackingGoal? _cachedGoal(String wsId, String goalId) {
    final userId = currentCacheUserId();
    if (userId == null) return null;
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: CacheKey(
        namespace: 'time_tracker.data',
        userId: userId,
        workspaceId: wsId,
        params: {'path': _goalsPath(wsId)},
      ),
      decode: (value) => Map<String, dynamic>.from(value! as Map),
    );
    final goals = cached.data?['goals'];
    if (goals is List) {
      for (final raw in goals) {
        if (raw is Map<String, dynamic> && raw['id'] == goalId) {
          return TimeTrackingGoal.fromJson(raw);
        }
      }
    }
    for (final mutation in OfflineMutationQueue.instance.pending.value) {
      if (mutation.feature == 'time_tracker' &&
          mutation.workspaceId == wsId &&
          mutation.method == 'POST' &&
          mutation.path == _goalsPath(wsId) &&
          mutation.entityId == goalId) {
        final payload = mutation.payload ?? const <String, dynamic>{};
        return TimeTrackingGoal(
          id: goalId,
          wsId: wsId,
          userId: userId,
          dailyGoalMinutes: payload['dailyGoalMinutes'] as int? ?? 0,
          categoryId: payload['categoryId'] as String?,
          weeklyGoalMinutes: payload['weeklyGoalMinutes'] as int?,
          isActive: payload['isActive'] as bool? ?? true,
        );
      }
    }
    return null;
  }

  Future<List<TimeTrackingGoal>> _getGoals(
    String wsId, {
    String? userId,
  }) async {
    final path = _goalsPath(wsId);
    final data = await _read(
      wsId,
      _withQuery(path, {
        if (userId != null && userId.isNotEmpty) 'userId': userId,
      }),
    );
    final source = (data['goals'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    if (userId != null && userId != currentCacheUserId()) {
      return source.map(TimeTrackingGoal.fromJson).toList(growable: false);
    }
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'time_tracker',
      pathContains: path,
      source: source,
      pending: await OfflineMutationQueue.instance.listPending(),
      normalizeCreate: (payload) => {
        'ws_id': wsId,
        'user_id': currentCacheUserId() ?? '',
        ..._goalPatch(payload),
      },
      normalizeUpdate: _goalPatch,
    );
    return rows.map(TimeTrackingGoal.fromJson).toList(growable: false);
  }

  Future<TimeTrackingGoal> _createGoal(
    String wsId, {
    required int dailyGoalMinutes,
    String? categoryId,
    int? weeklyGoalMinutes,
    bool isActive = true,
  }) async {
    final path = _goalsPath(wsId);
    final body = <String, dynamic>{
      'dailyGoalMinutes': dailyGoalMinutes,
      'isActive': isActive,
      if (categoryId != null) 'categoryId': categoryId,
      if (weeklyGoalMinutes != null) 'weeklyGoalMinutes': weeklyGoalMinutes,
    };
    return await queueOrSendValue<TimeTrackingGoal>(
      feature: 'time_tracker',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: body,
      pendingValue: (localId) => TimeTrackingGoal(
        id: localId,
        wsId: wsId,
        userId: currentCacheUserId() ?? '',
        dailyGoalMinutes: dailyGoalMinutes,
        categoryId: categoryId,
        weeklyGoalMinutes: weeklyGoalMinutes,
        isActive: isActive,
      ),
      send: () async {
        final response = await _api.postJson(path, body);
        return TimeTrackingGoal.fromJson(
          response['goal'] as Map<String, dynamic>,
        );
      },
    );
  }

  Future<TimeTrackingGoal> _updateGoal(
    String wsId,
    String goalId, {
    String? categoryId,
    bool includeCategoryId = false,
    bool includeWeeklyGoalMinutes = false,
    int? dailyGoalMinutes,
    int? weeklyGoalMinutes,
    bool? isActive,
  }) async {
    final path = '${_goalsPath(wsId)}/$goalId';
    final previous = _cachedGoal(wsId, goalId);
    final body = <String, dynamic>{
      if (includeCategoryId || categoryId != null) 'categoryId': categoryId,
      if (dailyGoalMinutes != null) 'dailyGoalMinutes': dailyGoalMinutes,
      if (includeWeeklyGoalMinutes || weeklyGoalMinutes != null)
        'weeklyGoalMinutes': weeklyGoalMinutes,
      if (isActive != null) 'isActive': isActive,
    };
    return await queueOrSendValue<TimeTrackingGoal>(
      feature: 'time_tracker',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: goalId,
      payload: body,
      pendingValue: (_) => TimeTrackingGoal(
        id: goalId,
        wsId: wsId,
        userId: previous?.userId ?? currentCacheUserId() ?? '',
        dailyGoalMinutes: dailyGoalMinutes ?? previous?.dailyGoalMinutes ?? 0,
        categoryId: includeCategoryId || categoryId != null
            ? categoryId
            : previous?.categoryId,
        weeklyGoalMinutes: includeWeeklyGoalMinutes || weeklyGoalMinutes != null
            ? weeklyGoalMinutes
            : previous?.weeklyGoalMinutes,
        isActive: isActive ?? previous?.isActive ?? true,
        category: includeCategoryId || categoryId != null
            ? null
            : previous?.category,
      ),
      send: () async {
        final response = await _api.patchJson(path, body);
        return TimeTrackingGoal.fromJson(
          response['goal'] as Map<String, dynamic>,
        );
      },
    );
  }

  Future<void> _deleteGoal(String wsId, String goalId) => queueOrSendVoid(
    feature: 'time_tracker',
    method: 'DELETE',
    path: '${_goalsPath(wsId)}/$goalId',
    workspaceId: wsId,
    entityId: goalId,
    send: () async {
      await _api.deleteJson('${_goalsPath(wsId)}/$goalId');
    },
  );
}
