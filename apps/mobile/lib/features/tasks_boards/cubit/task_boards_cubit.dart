import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_boards_state.dart';

class TaskBoardsCubit extends Cubit<TaskBoardsState> {
  TaskBoardsCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskBoardsState());

  final TaskRepository _taskRepository;
  int _loadRequestToken = 0;

  Future<void> loadBoards(String wsId, {int? pageSize}) async {
    await _loadBoardsForPage(wsId, page: 1, pageSize: pageSize, reset: true);
  }

  void setFilter(TaskBoardsFilter filter) {
    emit(state.copyWith(filter: filter));
  }

  Future<void> loadMoreBoards(String wsId) async {
    if (state.isLoadingMore || !state.hasNextPage) {
      return;
    }

    await _loadBoardsForPage(
      wsId,
      page: state.currentPage + 1,
      pageSize: state.pageSize,
      reset: false,
    );
  }

  Future<void> _loadBoardsForPage(
    String wsId, {
    required int page,
    required bool reset,
    int? pageSize,
  }) async {
    final requestToken = ++_loadRequestToken;
    final workspaceChanged = state.workspaceId != wsId;
    final normalizedPage = page < 1 ? 1 : page;
    final normalizedPageSize = (pageSize ?? state.pageSize).clamp(1, 200);
    final isLoadingMore =
        !reset && !workspaceChanged && state.boards.isNotEmpty;

    emit(
      state.copyWith(
        status: isLoadingMore ? state.status : TaskBoardsStatus.loading,
        workspaceId: wsId,
        currentPage: normalizedPage,
        pageSize: normalizedPageSize,
        totalCount: reset || workspaceChanged ? 0 : state.totalCount,
        boards: reset || workspaceChanged ? const [] : state.boards,
        isLoadingMore: isLoadingMore,
        clearError: true,
      ),
    );

    try {
      final pageData = await _taskRepository.getTaskBoards(
        wsId,
        page: normalizedPage,
        pageSize: normalizedPageSize,
      );
      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskBoardsStatus.loaded,
          workspaceId: wsId,
          currentPage: pageData.page,
          pageSize: pageData.pageSize,
          totalCount: pageData.totalCount,
          boards: reset || workspaceChanged
              ? pageData.boards
              : List.unmodifiable([...state.boards, ...pageData.boards]),
          isLoadingMore: false,
          clearError: true,
        ),
      );
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;
      emit(
        state.copyWith(
          status: TaskBoardsStatus.error,
          workspaceId: wsId,
          isLoadingMore: false,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> createBoard({
    required String wsId,
    required String name,
    String? icon,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.createTaskBoard(wsId: wsId, name: name, icon: icon),
    );
  }

  Future<void> updateBoard({
    required String wsId,
    required String boardId,
    required String name,
    String? icon,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.updateTaskBoard(
        wsId: wsId,
        boardId: boardId,
        name: name,
        icon: icon,
      ),
    );
  }

  Future<void> duplicateBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.duplicateTaskBoard(wsId: wsId, boardId: boardId),
    );
  }

  Future<void> archiveBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.archiveTaskBoard(wsId: wsId, boardId: boardId),
    );
  }

  Future<void> unarchiveBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.unarchiveTaskBoard(wsId: wsId, boardId: boardId),
    );
  }

  Future<void> softDeleteBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.softDeleteTaskBoard(wsId: wsId, boardId: boardId),
    );
  }

  Future<void> restoreBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.restoreTaskBoard(wsId: wsId, boardId: boardId),
    );
  }

  Future<void> permanentlyDeleteBoard({
    required String wsId,
    required String boardId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.permanentlyDeleteTaskBoard(
        wsId: wsId,
        boardId: boardId,
      ),
    );
  }

  Future<void> _runMutation(
    String wsId,
    Future<void> Function() action,
  ) async {
    emit(state.copyWith(status: TaskBoardsStatus.mutating, clearError: true));
    try {
      await action();
      if (state.workspaceId != wsId) {
        return;
      }
      await _loadBoardsForPage(
        wsId,
        page: 1,
        pageSize: state.pageSize,
        reset: true,
      );
    } catch (_) {
      if (state.workspaceId == wsId) {
        emit(
          state.copyWith(
            status: TaskBoardsStatus.loaded,
            isLoadingMore: false,
          ),
        );
      }
      rethrow;
    }
  }
}
