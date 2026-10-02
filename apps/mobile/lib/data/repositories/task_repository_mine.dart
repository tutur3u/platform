part of 'task_repository.dart';

extension _TaskRepositoryMine on TaskRepository {
  /// Fetches the current user's task buckets from the shared web API.
  Future<UserTasksPage> _getMyTasks({
    required String wsId,
    required bool isPersonal,
    int completedPage = 0,
    int completedLimit = 20,
  }) async {
    final query = _encodeQueryParameters({
      'wsId': wsId,
      'isPersonal': isPersonal.toString(),
      'completedPage': completedPage.toString(),
      'completedLimit': completedLimit.toString(),
    });

    Map<String, dynamic> response;
    try {
      response = await _read(wsId, 'mine', '/api/v1/users/me/tasks?$query');
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) {
        rethrow;
      }
      final pending = await OfflineMutationQueue.instance.listPending();
      if (!pending.any(
        (item) => item.workspaceId == wsId && item.feature == 'tasks',
      )) {
        rethrow;
      }
      response = const {};
    }
    if (completedPage == 0 && response['hasMoreCompleted'] == true) {
      unawaited(_warmCompletedHistory(wsId, isPersonal, completedLimit));
    }
    return overlayPendingUserTasks(
      workspaceId: wsId,
      userId: currentCacheUserId(),
      source: UserTasksPage.fromJson(response),
      pending: await OfflineMutationQueue.instance.listPending(),
    );
  }

  /// Fetch up to five older pages after a visit, without blocking first paint.
  Future<void> _warmCompletedHistory(String wsId, bool isPersonal, int limit) =>
      ApiClient.offlinePreparation(
        () => _warmCompletedHistoryImpl(wsId, isPersonal, limit),
        allowChallenge: false,
      );

  Future<void> _warmCompletedHistoryImpl(
    String wsId,
    bool isPersonal,
    int limit,
  ) async {
    final userId = currentCacheUserId();
    if (userId == null || limit <= 0) {
      return;
    }
    final key = '$userId:$wsId:$isPersonal:$limit';
    final previous = _historyWarmups[key];
    if (previous != null &&
        DateTime.now().difference(previous) < const Duration(minutes: 15)) {
      return;
    }
    _historyWarmups[key] = DateTime.now();
    try {
      if (!await hasNetworkConnection()) {
        return;
      }
      for (var page = 1; page <= 5; page++) {
        if (userId != currentCacheUserId()) {
          return;
        }
        final query = _encodeQueryParameters({
          'wsId': wsId,
          'isPersonal': isPersonal.toString(),
          'completedPage': page.toString(),
          'completedLimit': limit.toString(),
        });
        final response = await readThroughJson(
          api: _apiClient,
          namespace: 'tasks.mine',
          workspaceId: wsId,
          path: '/api/v1/users/me/tasks?$query',
          forceRefresh: true,
        );
        if (response['hasMoreCompleted'] != true) {
          break;
        }
      }
    } on Object {
      _historyWarmups.remove(key);
      // History warmup is best effort; explicit paging remains retryable.
    }
  }
}
