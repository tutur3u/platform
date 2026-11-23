part of 'task_repository.dart';

extension _TaskRepositoryMine on TaskRepository {
  /// Fetches the current user's task buckets from the shared web API.
  Future<UserTasksPage> _getMyTasks({
    required String wsId,
    required bool isPersonal,
    int completedPage = 0,
    int completedLimit = 20,
  }) async {
    final userId = currentCacheUserId();
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
      final optimistic = overlayPendingUserTasks(
        workspaceId: wsId,
        userId: currentCacheUserId(),
        source: UserTasksPage.fromJson(const {}),
        pending: pending,
      );
      if (optimistic.overdue.isEmpty &&
          optimistic.today.isEmpty &&
          optimistic.upcoming.isEmpty &&
          optimistic.completed.isEmpty) {
        rethrow;
      }
      response = const {};
    }
    final pending = await OfflineMutationQueue.instance.listPending();
    final cachedLists = await queryLocalRows(
      store: CacheStore.instance,
      userId: userId,
      workspaceId: wsId,
      namespaces: const ['tasks.boardLists'],
    );
    if (userId != currentCacheUserId()) {
      throw const ApiException(
        message: 'Task account changed.',
        statusCode: 401,
      );
    }
    return overlayPendingUserTasks(
      workspaceId: wsId,
      userId: userId,
      source: UserTasksPage.fromJson(response),
      pending: pending,
      cachedLists: cachedLists,
    );
  }
}
