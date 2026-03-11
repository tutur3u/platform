part of 'task_boards_cubit.dart';

const _taskBoardsSentinel = Object();

enum TaskBoardsStatus { initial, loading, loaded, mutating, error }

enum TaskBoardsFilter { all, active, archived, recentlyDeleted }

class TaskBoardsState extends Equatable {
  const TaskBoardsState({
    this.status = TaskBoardsStatus.initial,
    this.workspaceId,
    this.boards = const <TaskBoardSummary>[],
    this.filter = TaskBoardsFilter.all,
    this.pageSize = 20,
    this.error,
  });

  final TaskBoardsStatus status;
  final String? workspaceId;
  final List<TaskBoardSummary> boards;
  final TaskBoardsFilter filter;
  final int pageSize;
  final String? error;

  List<TaskBoardSummary> get filteredBoards {
    switch (filter) {
      case TaskBoardsFilter.all:
        return List<TaskBoardSummary>.unmodifiable(boards);
      case TaskBoardsFilter.active:
        return boards
            .where((board) => !board.isArchived && !board.isRecentlyDeleted)
            .toList(growable: false);
      case TaskBoardsFilter.archived:
        return boards
            .where((board) => board.isArchived)
            .toList(growable: false);
      case TaskBoardsFilter.recentlyDeleted:
        return boards
            .where((board) => board.isRecentlyDeleted)
            .toList(growable: false);
    }
  }

  TaskBoardsState copyWith({
    TaskBoardsStatus? status,
    Object? workspaceId = _taskBoardsSentinel,
    List<TaskBoardSummary>? boards,
    TaskBoardsFilter? filter,
    int? pageSize,
    Object? error = _taskBoardsSentinel,
    bool clearError = false,
  }) {
    return TaskBoardsState(
      status: status ?? this.status,
      workspaceId: workspaceId == _taskBoardsSentinel
          ? this.workspaceId
          : workspaceId as String?,
      boards: boards ?? this.boards,
      filter: filter ?? this.filter,
      pageSize: pageSize ?? this.pageSize,
      error: clearError
          ? null
          : error == _taskBoardsSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    workspaceId,
    boards,
    filter,
    pageSize,
    error,
  ];
}
