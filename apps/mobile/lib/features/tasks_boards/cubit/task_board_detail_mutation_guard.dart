part of 'task_board_detail_cubit.dart';

/// Thrown when a board mutation starts while another one runs.
///
/// It is an [Exception], not a [StateError], so callers' `on Exception`
/// handlers report it, and it is thrown before any optimistic change, so
/// there is nothing to roll back.
class TaskBoardMutationInProgressException implements Exception {
  const TaskBoardMutationInProgressException();

  @override
  String toString() => 'Another mutation is already in progress';
}

/// Runs board mutations one at a time.
mixin _TaskBoardMutationRunner on Cubit<TaskBoardDetailState> {
  Future<void> _invalidateBoardCaches({required String wsId});

  Future<void> loadBoardDetail({
    required String wsId,
    required String boardId,
    bool forceRefresh = false,
    bool retainError = false,
  });

  /// Call before an optimistic change, so a rejected mutation changes
  /// nothing.
  void _ensureNoMutationInProgress() {
    if (state.isMutating) throw const TaskBoardMutationInProgressException();
  }

  Future<void> _runMutation(
    Future<Object?> Function() action, {
    bool reloadBoard = true,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;

    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }
    _ensureNoMutationInProgress();

    emit(
      state.copyWith(
        isMutating: true,
        clearMutationError: true,
        clearError: true,
      ),
    );

    try {
      await action();

      if (isClosed) {
        return;
      }

      if (state.workspaceId != wsId || state.boardId != boardId) {
        emit(
          state.copyWith(
            isMutating: false,
            clearMutationError: true,
            clearError: true,
          ),
        );
        return;
      }

      await _invalidateBoardCaches(wsId: wsId);

      emit(
        state.copyWith(
          isMutating: false,
          clearMutationError: true,
          clearError: true,
        ),
      );

      if (reloadBoard) {
        await loadBoardDetail(wsId: wsId, boardId: boardId, forceRefresh: true);
      }
    } on Exception catch (error) {
      if (isClosed) {
        rethrow;
      }
      final isSameBoard = state.workspaceId == wsId && state.boardId == boardId;
      emit(
        state.copyWith(
          isMutating: false,
          clearError: true,
          mutationError: isSameBoard ? error.toString() : null,
          clearMutationError: !isSameBoard,
        ),
      );
      rethrow;
    }
  }
}
