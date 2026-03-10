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

  Future<void> loadBoards(String wsId) async {
    final requestToken = ++_loadRequestToken;
    final workspaceChanged = state.workspaceId != wsId;

    emit(
      state.copyWith(
        status: TaskBoardsStatus.loading,
        workspaceId: wsId,
        boards: workspaceChanged ? const [] : state.boards,
        clearError: true,
      ),
    );

    try {
      final boards = await _taskRepository.getTaskBoards(wsId);
      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskBoardsStatus.loaded,
          workspaceId: wsId,
          boards: boards,
          clearError: true,
        ),
      );
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;
      emit(
        state.copyWith(
          status: TaskBoardsStatus.error,
          workspaceId: wsId,
          error: error.toString(),
        ),
      );
    }
  }

  void setFilter(TaskBoardsFilter filter) {
    emit(state.copyWith(filter: filter));
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
      await loadBoards(wsId);
    } catch (_) {
      if (state.workspaceId == wsId) {
        emit(state.copyWith(status: TaskBoardsStatus.loaded));
      }
      rethrow;
    }
  }
}
