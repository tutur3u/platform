import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_board_detail_state.dart';

class TaskBoardDetailCubit extends Cubit<TaskBoardDetailState> {
  TaskBoardDetailCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskBoardDetailState());

  final TaskRepository _taskRepository;
  int _loadRequestToken = 0;

  Future<void> loadBoardDetail({
    required String wsId,
    required String boardId,
  }) async {
    final requestToken = ++_loadRequestToken;
    final targetChanged = state.workspaceId != wsId || state.boardId != boardId;

    emit(
      state.copyWith(
        status: TaskBoardDetailStatus.loading,
        workspaceId: wsId,
        boardId: boardId,
        board: targetChanged ? null : state.board,
        clearError: true,
      ),
    );

    try {
      final detail = await _taskRepository.getTaskBoardDetail(wsId, boardId);
      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskBoardDetailStatus.loaded,
          workspaceId: wsId,
          boardId: boardId,
          board: detail,
          clearError: true,
        ),
      );
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;
      emit(
        state.copyWith(
          status: TaskBoardDetailStatus.error,
          workspaceId: wsId,
          boardId: boardId,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> reload() async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    if (wsId == null || boardId == null) return;
    await loadBoardDetail(wsId: wsId, boardId: boardId);
  }

  void setView(TaskBoardDetailView view) {
    emit(state.copyWith(currentView: view));
  }

  void setSearchQuery(String value) {
    emit(state.copyWith(searchQuery: value));
  }

  void selectTask(String? taskId) {
    emit(state.copyWith(selectedTaskId: taskId));
  }
}
