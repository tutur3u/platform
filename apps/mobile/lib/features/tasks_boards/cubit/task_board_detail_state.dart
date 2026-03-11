part of 'task_board_detail_cubit.dart';

const _taskBoardDetailSentinel = Object();

enum TaskBoardDetailStatus { initial, loading, loaded, error }

enum TaskBoardDetailView { list, kanban }

class TaskBoardDetailState extends Equatable {
  const TaskBoardDetailState({
    this.status = TaskBoardDetailStatus.initial,
    this.workspaceId,
    this.boardId,
    this.board,
    this.currentView = TaskBoardDetailView.list,
    this.searchQuery = '',
    this.selectedTaskId,
    this.error,
  });

  final TaskBoardDetailStatus status;
  final String? workspaceId;
  final String? boardId;
  final TaskBoardDetail? board;
  final TaskBoardDetailView currentView;
  final String searchQuery;
  final String? selectedTaskId;
  final String? error;

  List<TaskBoardTask> get filteredTasks {
    final source = board?.tasks ?? const <TaskBoardTask>[];
    final query = searchQuery.trim().toLowerCase();
    if (query.isEmpty) return source;

    return source
        .where((task) {
          final name = task.name?.toLowerCase() ?? '';
          final description = task.description?.toLowerCase() ?? '';
          return name.contains(query) || description.contains(query);
        })
        .toList(growable: false);
  }

  Map<String, List<TaskBoardTask>> get filteredTasksByListId {
    final grouped = <String, List<TaskBoardTask>>{};
    for (final task in filteredTasks) {
      grouped.putIfAbsent(task.listId, () => <TaskBoardTask>[]).add(task);
    }
    return grouped;
  }

  TaskBoardDetailState copyWith({
    TaskBoardDetailStatus? status,
    Object? workspaceId = _taskBoardDetailSentinel,
    Object? boardId = _taskBoardDetailSentinel,
    Object? board = _taskBoardDetailSentinel,
    TaskBoardDetailView? currentView,
    String? searchQuery,
    Object? selectedTaskId = _taskBoardDetailSentinel,
    Object? error = _taskBoardDetailSentinel,
    bool clearError = false,
  }) {
    return TaskBoardDetailState(
      status: status ?? this.status,
      workspaceId: workspaceId == _taskBoardDetailSentinel
          ? this.workspaceId
          : workspaceId as String?,
      boardId: boardId == _taskBoardDetailSentinel
          ? this.boardId
          : boardId as String?,
      board: board == _taskBoardDetailSentinel
          ? this.board
          : board as TaskBoardDetail?,
      currentView: currentView ?? this.currentView,
      searchQuery: searchQuery ?? this.searchQuery,
      selectedTaskId: selectedTaskId == _taskBoardDetailSentinel
          ? this.selectedTaskId
          : selectedTaskId as String?,
      error: clearError
          ? null
          : error == _taskBoardDetailSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    workspaceId,
    boardId,
    board,
    currentView,
    searchQuery,
    selectedTaskId,
    error,
  ];
}
