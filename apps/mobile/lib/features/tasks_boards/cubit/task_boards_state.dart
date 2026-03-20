part of 'task_boards_cubit.dart';

const _taskBoardsSentinel = Object();

enum TaskBoardsStatus { initial, loading, loaded, mutating, error }

enum TaskBoardsFilter { all, active, archived, recentlyDeleted }

class TaskBoardsState extends Equatable {
  const TaskBoardsState({
    this.status = TaskBoardsStatus.initial,
    this.workspaceId,
    this.boards = const <TaskBoardSummary>[],
    this.filter = TaskBoardsFilter.active,
    this.currentPage = 1,
    this.pageSize = 20,
    this.totalCount = 0,
    this.isLoadingMore = false,
    this.error,
  });

  final TaskBoardsStatus status;
  final String? workspaceId;
  final List<TaskBoardSummary> boards;
  final TaskBoardsFilter filter;
  final int currentPage;
  final int pageSize;
  final int totalCount;
  final bool isLoadingMore;
  final String? error;

  int get totalPages {
    if (totalCount <= 0) return 1;
    return (totalCount / pageSize).ceil();
  }

  bool get hasPreviousPage => currentPage > 1;

  bool get hasNextPage => currentPage < totalPages;

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
    int? currentPage,
    int? pageSize,
    int? totalCount,
    bool? isLoadingMore,
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
      currentPage: currentPage ?? this.currentPage,
      pageSize: pageSize ?? this.pageSize,
      totalCount: totalCount ?? this.totalCount,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
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
    currentPage,
    pageSize,
    totalCount,
    isLoadingMore,
    error,
  ];
}
