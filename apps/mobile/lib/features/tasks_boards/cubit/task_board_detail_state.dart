part of 'task_board_detail_cubit.dart';

const _taskBoardDetailSentinel = Object();

enum TaskBoardDetailStatus { initial, loading, loaded, error }

enum TaskBoardDetailView { list, kanban }

class TaskBoardDetailFilters extends Equatable {
  const TaskBoardDetailFilters({
    this.listIds = const <String>{},
    this.statuses = const <String>{},
    this.priorities = const <String>{},
    this.assigneeIds = const <String>{},
    this.labelIds = const <String>{},
    this.projectIds = const <String>{},
  });

  final Set<String> listIds;
  final Set<String> statuses;
  final Set<String> priorities;
  final Set<String> assigneeIds;
  final Set<String> labelIds;
  final Set<String> projectIds;

  bool get hasAdvancedFilters =>
      listIds.isNotEmpty ||
      statuses.isNotEmpty ||
      priorities.isNotEmpty ||
      assigneeIds.isNotEmpty ||
      labelIds.isNotEmpty ||
      projectIds.isNotEmpty;

  TaskBoardDetailFilters copyWith({
    Set<String>? listIds,
    Set<String>? statuses,
    Set<String>? priorities,
    Set<String>? assigneeIds,
    Set<String>? labelIds,
    Set<String>? projectIds,
  }) {
    return TaskBoardDetailFilters(
      listIds: listIds ?? this.listIds,
      statuses: statuses ?? this.statuses,
      priorities: priorities ?? this.priorities,
      assigneeIds: assigneeIds ?? this.assigneeIds,
      labelIds: labelIds ?? this.labelIds,
      projectIds: projectIds ?? this.projectIds,
    );
  }

  @override
  List<Object?> get props => [
    listIds,
    statuses,
    priorities,
    assigneeIds,
    labelIds,
    projectIds,
  ];
}

class TaskBoardDetailState extends Equatable {
  const TaskBoardDetailState({
    this.status = TaskBoardDetailStatus.initial,
    this.workspaceId,
    this.boardId,
    this.board,
    this.currentView = TaskBoardDetailView.kanban,
    this.searchQuery = '',
    this.filters = const TaskBoardDetailFilters(),
    this.taskDescriptionSearchIndex = const <String, String>{},
    this.listTasksByListId = const <String, List<TaskBoardTask>>{},
    this.loadedListIds = const <String>{},
    this.loadingListIds = const <String>{},
    this.listHasMoreById = const <String, bool>{},
    this.listOffsetsById = const <String, int>{},
    this.listPageSizeById = const <String, int>{},
    this.listLoadErrorById = const <String, String>{},
    this.selectedTaskId,
    this.isMutating = false,
    this.mutationError,
    this.error,
  });

  final TaskBoardDetailStatus status;
  final String? workspaceId;
  final String? boardId;
  final TaskBoardDetail? board;
  final TaskBoardDetailView currentView;
  final String searchQuery;
  final TaskBoardDetailFilters filters;
  final Map<String, String> taskDescriptionSearchIndex;
  final Map<String, List<TaskBoardTask>> listTasksByListId;
  final Set<String> loadedListIds;
  final Set<String> loadingListIds;
  final Map<String, bool> listHasMoreById;
  final Map<String, int> listOffsetsById;
  final Map<String, int> listPageSizeById;
  final Map<String, String> listLoadErrorById;
  final String? selectedTaskId;
  final bool isMutating;
  final String? mutationError;
  final String? error;

  bool get isLoadingListTasks => loadingListIds.isNotEmpty;

  List<TaskBoardTask> get filteredTasks {
    final source = board?.tasks ?? const <TaskBoardTask>[];
    final listsById = {
      for (final list in board?.lists ?? const <TaskBoardList>[]) list.id: list,
    };
    final query = searchQuery.trim().toLowerCase();
    final hasSearchQuery = query.isNotEmpty;
    final hasAssigneeFilter = filters.assigneeIds.isNotEmpty;
    final hasLabelFilter = filters.labelIds.isNotEmpty;
    final hasProjectFilter = filters.projectIds.isNotEmpty;
    final hasPriorityFilter = filters.priorities.isNotEmpty;
    final hasListFilter = filters.listIds.isNotEmpty;
    final hasStatusFilter = filters.statuses.isNotEmpty;
    final normalizedPriorities = hasPriorityFilter
        ? filters.priorities
              .map((priority) => priority.trim().toLowerCase())
              .toSet()
        : const <String>{};
    final normalizedStatuses = hasStatusFilter
        ? filters.statuses.map((status) => status.trim().toLowerCase()).toSet()
        : const <String>{};

    if (!hasSearchQuery &&
        !hasAssigneeFilter &&
        !hasLabelFilter &&
        !hasProjectFilter &&
        !hasPriorityFilter &&
        !hasListFilter &&
        !hasStatusFilter) {
      return source;
    }

    return source
        .where((task) {
          if (hasSearchQuery) {
            final name = task.name?.toLowerCase() ?? '';
            final description = taskDescriptionSearchIndex[task.id] ?? '';
            final matchesSearch =
                name.contains(query) || description.contains(query);
            if (!matchesSearch) return false;
          }

          if (hasListFilter && !filters.listIds.contains(task.listId)) {
            return false;
          }

          if (hasPriorityFilter) {
            final taskPriority = (task.priority ?? 'normal')
                .trim()
                .toLowerCase();
            if (!normalizedPriorities.contains(taskPriority)) {
              return false;
            }
          }

          if (hasStatusFilter) {
            final listStatus = listsById[task.listId]?.status
                ?.trim()
                .toLowerCase();
            if (listStatus == null ||
                !normalizedStatuses.contains(listStatus)) {
              return false;
            }
          }

          if (hasAssigneeFilter) {
            final hasMatchingAssignee = task.assigneeIds.any(
              filters.assigneeIds.contains,
            );
            if (!hasMatchingAssignee) {
              return false;
            }
          }

          if (hasLabelFilter) {
            final hasMatchingLabel = task.labelIds.any(
              filters.labelIds.contains,
            );
            if (!hasMatchingLabel) {
              return false;
            }
          }

          if (hasProjectFilter) {
            final hasMatchingProject = task.projectIds.any(
              filters.projectIds.contains,
            );
            if (!hasMatchingProject) {
              return false;
            }
          }

          return true;
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
    TaskBoardDetailFilters? filters,
    Map<String, String>? taskDescriptionSearchIndex,
    Map<String, List<TaskBoardTask>>? listTasksByListId,
    Set<String>? loadedListIds,
    Set<String>? loadingListIds,
    Map<String, bool>? listHasMoreById,
    Map<String, int>? listOffsetsById,
    Map<String, int>? listPageSizeById,
    Map<String, String>? listLoadErrorById,
    Object? selectedTaskId = _taskBoardDetailSentinel,
    bool? isMutating,
    Object? mutationError = _taskBoardDetailSentinel,
    Object? error = _taskBoardDetailSentinel,
    bool clearMutationError = false,
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
      filters: filters ?? this.filters,
      taskDescriptionSearchIndex:
          taskDescriptionSearchIndex ?? this.taskDescriptionSearchIndex,
      listTasksByListId: listTasksByListId ?? this.listTasksByListId,
      loadedListIds: loadedListIds ?? this.loadedListIds,
      loadingListIds: loadingListIds ?? this.loadingListIds,
      listHasMoreById: listHasMoreById ?? this.listHasMoreById,
      listOffsetsById: listOffsetsById ?? this.listOffsetsById,
      listPageSizeById: listPageSizeById ?? this.listPageSizeById,
      listLoadErrorById: listLoadErrorById ?? this.listLoadErrorById,
      selectedTaskId: selectedTaskId == _taskBoardDetailSentinel
          ? this.selectedTaskId
          : selectedTaskId as String?,
      isMutating: isMutating ?? this.isMutating,
      mutationError: clearMutationError
          ? null
          : mutationError == _taskBoardDetailSentinel
          ? this.mutationError
          : mutationError as String?,
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
    filters,
    taskDescriptionSearchIndex,
    listTasksByListId,
    loadedListIds,
    loadingListIds,
    listHasMoreById,
    listOffsetsById,
    listPageSizeById,
    listLoadErrorById,
    selectedTaskId,
    isMutating,
    mutationError,
    error,
  ];
}
