part of 'task_repository.dart';

extension TaskRepositoryEstimation on TaskRepository {
  Future<List<TaskEstimateBoard>> getTaskEstimateBoards(String wsId) async {
    final response = await _read(
      wsId,
      'estimation',
      '/api/v1/workspaces/$wsId/boards/estimation',
    );
    final boards = (response['boards'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => TaskEstimateBoard.fromJson(Map<String, dynamic>.from(row)),
        )
        .toList(growable: false);
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

  Future<TaskEstimateBoard> updateBoardEstimation({
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
    return queueOrSendValue<TaskEstimateBoard>(
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
      send: () async =>
          TaskEstimateBoard.fromJson(await _apiClient.patchJson(path, payload)),
    );
  }
}
