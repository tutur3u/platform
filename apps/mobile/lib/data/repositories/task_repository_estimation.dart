part of 'task_repository.dart';

extension TaskRepositoryEstimation on TaskRepository {
  Future<List<TaskEstimateBoard>> getTaskEstimateBoards(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final path = '/api/v1/workspaces/$wsId/boards/estimation';
    final response = forceRefresh
        ? await readThroughJson(
            api: _apiClient,
            namespace: 'tasks.estimation',
            workspaceId: wsId,
            path: path,
            forceRefresh: true,
          )
        : await _read(wsId, 'estimation', path);
    final boards = TaskEstimateBoard.listFromJson(response['boards']);
    final edits = OfflineMutationQueue.instance.pending.value.where(
      (edit) =>
          edit.feature == 'tasks' &&
          edit.workspaceId == wsId &&
          edit.method == 'PATCH' &&
          edit.path.endsWith('/estimation'),
    );
    return boards
        .map((board) {
          var current = board;
          for (final edit in edits) {
            if (edit.entityId != board.id) continue;
            final payload = edit.payload ?? const <String, dynamic>{};
            current = current.copyWith(
              estimationType: payload['estimation_type'],
              extendedEstimation: payload['extended_estimation'] as bool?,
              allowZeroEstimates: payload['allow_zero_estimates'] as bool?,
              countUnestimatedIssues:
                  payload['count_unestimated_issues'] as bool?,
            );
          }
          return current;
        })
        .toList(growable: false);
  }

  /// Null means the PATCH was acknowledged but its body requires a fresh read.
  Future<TaskEstimateBoard?> updateBoardEstimation({
    required String wsId,
    required String boardId,
    required String? estimationType,
    required bool extendedEstimation,
    required bool allowZeroEstimates,
    required bool countUnestimatedIssues,
  }) {
    final path = '/api/v1/workspaces/$wsId/boards/$boardId/estimation';
    final payload = {
      'estimation_type': estimationType,
      'extended_estimation': extendedEstimation,
      'allow_zero_estimates': allowZeroEstimates,
      'count_unestimated_issues': countUnestimatedIssues,
    };
    return queueOrSendValue<TaskEstimateBoard?>(
      feature: 'tasks',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: boardId,
      payload: payload,
      pendingValue: (_) => TaskEstimateBoard(
        id: boardId,
        createdAt: null,
        estimationType: estimationType,
        extendedEstimation: extendedEstimation,
        allowZeroEstimates: allowZeroEstimates,
        countUnestimatedIssues: countUnestimatedIssues,
      ),
      send: () async {
        try {
          final response = await _apiClient.patchJson(path, payload);
          return TaskEstimateBoard.fromJson(response);
        } on FormatException {
          return null;
        } on ApiException catch (error) {
          if (error.failureKind == ApiFailureKind.response) return null;
          rethrow;
        }
      },
    );
  }
}
