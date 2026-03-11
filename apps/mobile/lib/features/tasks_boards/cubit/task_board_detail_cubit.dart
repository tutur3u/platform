import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
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

  Future<void> createTask({
    required String listId,
    required String name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.createBoardTask(
        wsId: wsId,
        listId: listId,
        name: name,
        description: description,
        priority: priority,
        startDate: startDate,
        endDate: endDate,
        estimationPoints: estimationPoints,
        labelIds: labelIds,
        projectIds: projectIds,
        assigneeIds: assigneeIds,
      ),
    );
  }

  Future<void> updateTask({
    required String taskId,
    required String name,
    String? description,
    String? priority,
    DateTime? startDate,
    DateTime? endDate,
    int? estimationPoints,
    List<String>? labelIds,
    List<String>? projectIds,
    List<String>? assigneeIds,
    bool clearDescription = false,
    bool clearStartDate = false,
    bool clearEndDate = false,
    bool clearEstimationPoints = false,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.updateBoardTask(
        wsId: wsId,
        taskId: taskId,
        name: name,
        description: description,
        priority: priority,
        startDate: startDate,
        endDate: endDate,
        estimationPoints: estimationPoints,
        labelIds: labelIds,
        projectIds: projectIds,
        assigneeIds: assigneeIds,
        clearDescription: clearDescription,
        clearStartDate: clearStartDate,
        clearEndDate: clearEndDate,
        clearEstimationPoints: clearEstimationPoints,
      ),
    );
  }

  Future<void> moveTask({
    required String taskId,
    required String listId,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.moveBoardTask(
        wsId: wsId,
        taskId: taskId,
        listId: listId,
      ),
    );
  }

  void setView(TaskBoardDetailView view) {
    emit(state.copyWith(currentView: view));
  }

  void setSearchQuery(String value) {
    emit(state.copyWith(searchQuery: value));
  }

  void setFilters(TaskBoardDetailFilters filters) {
    emit(state.copyWith(filters: filters));
  }

  void clearAdvancedFilters() {
    emit(state.copyWith(filters: const TaskBoardDetailFilters()));
  }

  void selectTask(String? taskId) {
    emit(state.copyWith(selectedTaskId: taskId));
  }

  Future<void> createList({
    required String name,
    required String status,
    required String color,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    await _runMutation(
      () => _taskRepository.createBoardList(
        wsId: wsId,
        boardId: boardId,
        name: name,
        status: status,
        color: color,
      ),
    );
  }

  Future<void> updateList({
    required String listId,
    required String name,
    required String status,
    required String color,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    await _runMutation(
      () => _taskRepository.updateBoardList(
        wsId: wsId,
        boardId: boardId,
        listId: listId,
        name: name,
        status: status,
        color: color,
      ),
    );
  }

  Future<void> renameBoard({
    required String name,
    String? icon,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    await _runMutation(
      () => _taskRepository.updateTaskBoard(
        wsId: wsId,
        boardId: boardId,
        name: name,
        icon: icon,
      ),
    );
  }

  Future<void> _runMutation(Future<Object?> Function() action) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;

    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    if (state.isMutating) {
      throw StateError('Another mutation is already in progress');
    }

    emit(
      state.copyWith(
        isMutating: true,
        clearMutationError: true,
        clearError: true,
      ),
    );

    try {
      await action();

      if (state.workspaceId != wsId || state.boardId != boardId) {
        return;
      }

      emit(
        state.copyWith(
          isMutating: false,
          clearMutationError: true,
          clearError: true,
        ),
      );

      await loadBoardDetail(wsId: wsId, boardId: boardId);
    } on Exception catch (error) {
      if (state.workspaceId == wsId && state.boardId == boardId) {
        emit(
          state.copyWith(
            isMutating: false,
            mutationError: error.toString(),
          ),
        );
      }
      rethrow;
    }
  }
}
