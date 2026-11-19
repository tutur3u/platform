part of 'task_board_detail_cubit.dart';

mixin _TaskBoardTaskPlacement on _TaskBoardMutationRunner {
  TaskRepository get _taskRepository;
  int get _loadRequestToken;
  set _loadRequestToken(int value);
  String? _findTaskListId(String taskId);

  void _optimisticallyMoveTaskToList({
    required String taskId,
    required String listId,
    Map<String, int> sortKeys,
  });

  Future<void> _refreshBoardAndTaskLists({
    required String wsId,
    required String boardId,
    required Set<String> affectedListIds,
    Map<String, int?> pageSizeHints,
  });

  Future<void> moveTask({
    required String taskId,
    required String listId,
    String? beforeTaskId,
    bool positionCard = false,
  }) async {
    final wsId = state.workspaceId;
    final board = state.board;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }

    final sourceListId = _findTaskListId(taskId);
    if (!positionCard && sourceListId == listId) return;
    final task = board.tasks.where((item) => item.id == taskId).firstOrNull;
    final targetList = board.lists
        .where((item) => item.id == listId)
        .firstOrNull;
    if (task == null || targetList == null) return;
    final needsOrdering = positionCard || task.isPersonalExternal;
    final otherTasks =
        (state.listTasksByListId[listId] ??
                board.tasks.where((item) => item.listId == listId))
            .toList()
          ..sort(compareKanbanTasks);
    final sourceIndex = otherTasks.indexWhere((item) => item.id == taskId);
    if (sourceIndex != -1) otherTasks.removeAt(sourceIndex);
    final targetIndex = beforeTaskId == null
        ? otherTasks.length
        : otherTasks.indexWhere((item) => item.id == beforeTaskId);
    if (needsOrdering && (targetIndex < 0 || sourceIndex == targetIndex)) {
      return;
    }
    final sortKeys = needsOrdering && otherTasks.isNotEmpty
        ? kanbanPlacementKeys(otherTasks, taskId: taskId, index: targetIndex)
        : const <String, int>{};
    final adjustedKeys = task.isPersonalExternal
        ? {if (sortKeys[taskId] case final key?) taskId: key}
        : sortKeys;
    final pageSizeHints = <String, int?>{
      if (sourceListId != null)
        sourceListId: state.listPageSizeById[sourceListId],
      listId: state.listPageSizeById[listId],
    };
    final affectedListIds = <String>{
      if (sourceListId != null) sourceListId,
      listId,
    };

    // Ignore list reads started before the optimistic move. A stale cached
    // revalidation can otherwise put the task back in its previous list.
    // Reject a concurrent move first, or dropped reads leave lists loading.
    _ensureNoMutationInProgress();
    _loadRequestToken++;
    _optimisticallyMoveTaskToList(
      taskId: taskId,
      listId: listId,
      sortKeys: adjustedKeys,
    );

    try {
      await _runMutation(() async {
        if (task.isPersonalExternal) {
          // The placement endpoint resolves the current account's order from
          // its neighbours without relocating the source card.
          await _taskRepository.placePersonalBoardTask(
            taskId: taskId,
            boardId: board.id,
            listId: listId,
            sortKey: sortKeys[taskId],
            previousTaskId: targetIndex > 0
                ? otherTasks[targetIndex - 1].id
                : null,
            nextTaskId: targetIndex < otherTasks.length
                ? otherTasks[targetIndex].id
                : null,
            terminalStatus: targetList.completesWork && sourceListId != listId
                ? targetList.status
                : null,
          );
          return null;
        }
        if (sortKeys.isEmpty) {
          return await _taskRepository.moveBoardTask(
            wsId: wsId,
            taskId: taskId,
            listId: listId,
          );
        }
        for (final neighbour in otherTasks) {
          final key = sortKeys[neighbour.id];
          if (key == null) continue;
          if (neighbour.isPersonalExternal) {
            await _taskRepository.placePersonalBoardTask(
              taskId: neighbour.id,
              boardId: board.id,
              listId: listId,
              sortKey: key,
            );
          } else {
            await _taskRepository.updateTask(neighbour.id, {
              'sort_key': key,
            }, wsId: wsId);
          }
        }
        await _taskRepository.updateTask(taskId, {
          if (sourceListId != listId) 'list_id': listId,
          'sort_key': sortKeys[taskId],
        }, wsId: wsId);
        return null;
      }, reloadBoard: false);
    } on Exception {
      if (!isClosed && state.workspaceId == wsId && state.boardId == board.id) {
        await _refreshBoardAndTaskLists(
          wsId: wsId,
          boardId: board.id,
          affectedListIds: affectedListIds,
          pageSizeHints: pageSizeHints,
        );
      }
      rethrow;
    }

    if (isClosed || state.workspaceId != wsId || state.boardId != board.id) {
      return;
    }

    await _refreshBoardAndTaskLists(
      wsId: wsId,
      boardId: board.id,
      affectedListIds: affectedListIds,
      pageSizeHints: pageSizeHints,
    );
  }
}
