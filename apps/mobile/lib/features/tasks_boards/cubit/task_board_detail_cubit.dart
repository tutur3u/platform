import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_board_detail_state.dart';

class TaskBoardDetailCubit extends Cubit<TaskBoardDetailState> {
  TaskBoardDetailCubit({required TaskRepository taskRepository})
    : _taskRepository = taskRepository,
      super(const TaskBoardDetailState());

  static const int _listTaskPageSize = 50;
  static const int _initialPrefetchListCount = 3;

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
        filters: targetChanged ? const TaskBoardDetailFilters() : state.filters,
        taskDescriptionSearchIndex: targetChanged
            ? const <String, String>{}
            : state.taskDescriptionSearchIndex,
        listTasksByListId: targetChanged
            ? const <String, List<TaskBoardTask>>{}
            : state.listTasksByListId,
        loadedListIds: targetChanged ? const <String>{} : state.loadedListIds,
        loadingListIds: targetChanged ? const <String>{} : state.loadingListIds,
        listHasMoreById: targetChanged
            ? const <String, bool>{}
            : state.listHasMoreById,
        listOffsetsById: targetChanged
            ? const <String, int>{}
            : state.listOffsetsById,
        listPageSizeById: targetChanged
            ? const <String, int>{}
            : state.listPageSizeById,
        selectedTaskId: targetChanged ? null : state.selectedTaskId,
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
          taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
            detail.tasks,
          ),
          listTasksByListId: const <String, List<TaskBoardTask>>{},
          loadedListIds: const <String>{},
          loadingListIds: const <String>{},
          listHasMoreById: const <String, bool>{},
          listOffsetsById: const <String, int>{},
          listPageSizeById: const <String, int>{},
          clearError: true,
        ),
      );

      await _prefetchInitialLists(requestToken: requestToken, detail: detail);
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

  Future<void> loadListTasks({
    required String listId,
    bool loadMore = false,
    bool forceRefresh = false,
    int? pageSizeHint,
  }) async {
    final wsId = state.workspaceId;
    final board = state.board;
    final requestToken = _loadRequestToken;
    if (wsId == null || board == null) {
      return;
    }

    if (!board.lists.any((list) => list.id == listId)) {
      return;
    }

    if (state.loadingListIds.contains(listId)) {
      return;
    }

    if (!loadMore && !forceRefresh && state.loadedListIds.contains(listId)) {
      return;
    }

    if (loadMore && !(state.listHasMoreById[listId] ?? true)) {
      return;
    }

    final pageSize =
        state.listPageSizeById[listId] ?? _normalizePageSize(pageSizeHint);
    final offset = loadMore ? (state.listOffsetsById[listId] ?? 0) : 0;
    final nextLoading = {...state.loadingListIds, listId};
    emit(state.copyWith(loadingListIds: nextLoading));

    try {
      final page = await _taskRepository.getBoardTasksForList(
        wsId,
        listId: listId,
        limit: pageSize,
        offset: offset,
        members: board.members,
        labels: board.labels,
        projects: board.projects,
      );

      if (requestToken != _loadRequestToken ||
          state.workspaceId != wsId ||
          state.board?.id != board.id) {
        final nextLoadingDone = {...state.loadingListIds}..remove(listId);
        emit(state.copyWith(loadingListIds: nextLoadingDone));
        return;
      }

      final existing = loadMore
          ? (state.listTasksByListId[listId] ?? const <TaskBoardTask>[])
          : const <TaskBoardTask>[];
      final merged = _mergeTaskPages(existing, page);
      final nextTasksByList = Map<String, List<TaskBoardTask>>.from(
        state.listTasksByListId,
      )..[listId] = List.unmodifiable(merged);
      final nextLoaded = {...state.loadedListIds, listId};
      final nextLoadingDone = {...state.loadingListIds}..remove(listId);
      final nextHasMore = Map<String, bool>.from(state.listHasMoreById)
        ..[listId] = page.length >= pageSize;
      final nextOffsets = Map<String, int>.from(state.listOffsetsById)
        ..[listId] = merged.length;
      final nextPageSizes = Map<String, int>.from(state.listPageSizeById)
        ..[listId] = pageSize;
      final nextBoard = board.copyWith(
        tasks: _flattenTasks(board.lists, nextTasksByList),
      );

      emit(
        state.copyWith(
          board: nextBoard,
          taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
            nextBoard.tasks,
          ),
          listTasksByListId: nextTasksByList,
          loadedListIds: nextLoaded,
          loadingListIds: nextLoadingDone,
          listHasMoreById: nextHasMore,
          listOffsetsById: nextOffsets,
          listPageSizeById: nextPageSizes,
        ),
      );
    } on Exception {
      if (requestToken != _loadRequestToken) {
        return;
      }
      if (state.workspaceId != wsId || state.board?.id != board.id) {
        return;
      }
      final nextLoadingDone = {...state.loadingListIds}..remove(listId);
      emit(state.copyWith(loadingListIds: nextLoadingDone));
    }
  }

  Future<void> ensureAllListsLoaded() async {
    final board = state.board;
    if (board == null) return;

    final futures = board.lists
        .map((list) => loadListTasks(listId: list.id))
        .toList(growable: false);
    await Future.wait<void>(futures);
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

  Future<void> loadTaskRelationships({required String taskId}) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    final requestToken = _loadRequestToken;
    if (wsId == null || boardId == null || state.board == null) {
      throw StateError('Board detail is not initialized');
    }

    final relationships = await _taskRepository.getTaskRelationships(
      wsId: wsId,
      taskId: taskId,
    );

    if (requestToken != _loadRequestToken) {
      return;
    }

    if (state.workspaceId != wsId || state.boardId != boardId) {
      return;
    }

    final board = state.board;
    if (board == null) {
      return;
    }

    var taskFound = false;
    final nextTasks = board.tasks
        .map(
          (task) {
            if (task.id != taskId) {
              return task;
            }
            taskFound = true;
            return task.copyWith(
              relationships: relationships,
              relationshipsLoaded: true,
              relationshipSummary: TaskRelationshipSummary(
                parentTaskId: relationships.parentTask?.id,
                childCount: relationships.childTasks.length,
                blockedByCount: relationships.blockedBy.length,
                blockingCount: relationships.blocking.length,
                relatedCount: relationships.relatedTasks.length,
              ),
            );
          },
        )
        .toList(growable: false);

    if (!taskFound) {
      return;
    }

    emit(state.copyWith(board: board.copyWith(tasks: nextTasks)));
  }

  Map<String, String> _buildTaskDescriptionSearchIndex(
    Iterable<TaskBoardTask> tasks,
  ) {
    final index = <String, String>{};

    for (final task in tasks) {
      final description = parseTipTapTaskDescription(
        task.description,
      )?.plainText;
      if (description == null) continue;

      final normalized = description.trim().toLowerCase();
      if (normalized.isEmpty) continue;
      index[task.id] = normalized;
    }

    return Map.unmodifiable(index);
  }

  Future<void> createTaskRelationship({
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.createTaskRelationship(
        wsId: wsId,
        taskId: taskId,
        sourceTaskId: sourceTaskId,
        targetTaskId: targetTaskId,
        type: type,
      ),
    );
  }

  Future<List<TaskLinkOption>> getRelationshipTaskOptions() async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    // getRelationshipTaskOptions intentionally skips _runMutation because this
    // is a read-only fetch; keeping reads out of _runMutation avoids toggling
    // isMutating, and callers should handle any propagated errors.
    return _taskRepository.getWorkspaceTasksForProjectLinking(wsId);
  }

  Future<void> deleteTaskRelationship({
    required String taskId,
    required String sourceTaskId,
    required String targetTaskId,
    required TaskRelationshipType type,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.deleteTaskRelationship(
        wsId: wsId,
        taskId: taskId,
        sourceTaskId: sourceTaskId,
        targetTaskId: targetTaskId,
        type: type,
      ),
    );
  }

  void setView(TaskBoardDetailView view) {
    emit(state.copyWith(currentView: view));
  }

  void setSearchQuery(String value) {
    emit(state.copyWith(searchQuery: value));
    if (value.trim().isNotEmpty) {
      unawaited(ensureAllListsLoaded());
    }
  }

  void setFilters(TaskBoardDetailFilters filters) {
    emit(state.copyWith(filters: filters));
    if (filters.hasAdvancedFilters) {
      unawaited(ensureAllListsLoaded());
    }
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

  Future<void> _runMutation(
    Future<Object?> Function() action, {
    bool reloadBoard = true,
  }) async {
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
        emit(
          state.copyWith(
            isMutating: false,
            clearMutationError: true,
            clearError: true,
          ),
        );
        return;
      }

      emit(
        state.copyWith(
          isMutating: false,
          clearMutationError: true,
          clearError: true,
        ),
      );

      if (reloadBoard) {
        await loadBoardDetail(wsId: wsId, boardId: boardId);
      }
    } on Exception catch (error) {
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

  Future<void> _prefetchInitialLists({
    required int requestToken,
    required TaskBoardDetail detail,
  }) async {
    final sortedLists = [...detail.lists]
      ..sort((a, b) {
        final aPosition = a.position ?? 0;
        final bPosition = b.position ?? 0;
        if (aPosition != bPosition) {
          return aPosition.compareTo(bPosition);
        }
        final aName = a.name?.trim().toLowerCase() ?? '';
        final bName = b.name?.trim().toLowerCase() ?? '';
        return aName.compareTo(bName);
      });

    final initialIds = sortedLists
        .take(_initialPrefetchListCount)
        .map((list) => list.id)
        .toList(growable: false);

    for (final listId in initialIds) {
      if (requestToken != _loadRequestToken) {
        return;
      }
      await loadListTasks(listId: listId);
    }
  }

  static int _normalizePageSize(int? pageSizeHint) {
    final raw = pageSizeHint ?? _listTaskPageSize;
    return raw.clamp(10, 100);
  }

  static List<TaskBoardTask> _mergeTaskPages(
    List<TaskBoardTask> existing,
    List<TaskBoardTask> incoming,
  ) {
    if (existing.isEmpty) return List<TaskBoardTask>.from(incoming);
    if (incoming.isEmpty) return List<TaskBoardTask>.from(existing);

    final byId = <String, TaskBoardTask>{
      for (final task in existing) task.id: task,
    };
    for (final task in incoming) {
      byId[task.id] = task;
    }

    return byId.values.toList(growable: false);
  }

  static List<TaskBoardTask> _flattenTasks(
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByListId,
  ) {
    final flattened = <TaskBoardTask>[];
    for (final list in lists) {
      final listTasks = tasksByListId[list.id];
      if (listTasks == null || listTasks.isEmpty) {
        continue;
      }
      flattened.addAll(listTasks);
    }
    return List.unmodifiable(flattened);
  }
}
