import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_bulk.dart';
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
  static const Duration _deletedTasksCacheTtl = Duration(minutes: 3);
  static const CachePolicy _detailCachePolicy = CachePolicies.detail;
  static const CachePolicy _listTasksCachePolicy = CachePolicies.moduleData;
  static const _detailCacheTag = 'tasks:board-detail';
  static const _listTasksCacheTag = 'tasks:board-list-tasks';

  final TaskRepository _taskRepository;
  int _loadRequestToken = 0;
  List<TaskBoardTask>? _cachedDeletedTasks;
  DateTime? _cachedDeletedTasksAt;
  String? _cachedDeletedTasksWorkspaceId;
  String? _cachedDeletedTasksBoardId;

  static TaskBoardDetail _decodeBoardDetailCache(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task board detail cache payload.');
    }
    return TaskBoardDetail.fromJson(Map<String, dynamic>.from(json));
  }

  static List<TaskBoardTask> _decodeListTasksCache(Object? json) {
    if (json is! List<dynamic>) {
      throw const FormatException('Invalid task board list cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(TaskBoardTask.fromJson)
        .toList(growable: false);
  }

  static CacheKey _detailCacheKey({
    required String wsId,
    required String boardId,
  }) {
    return CacheKey(
      namespace: 'tasks.board_detail',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      schemaVersion: 2,
      params: {'boardId': boardId},
    );
  }

  static CacheKey _listTasksCacheKey({
    required String wsId,
    required String boardId,
    required String listId,
    required int limit,
    required int offset,
  }) {
    return CacheKey(
      namespace: 'tasks.board_list_tasks',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      schemaVersion: 2,
      params: {
        'boardId': boardId,
        'listId': listId,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
    );
  }

  Future<void> loadBoardDetail({
    required String wsId,
    required String boardId,
    bool forceRefresh = false,
  }) async {
    final requestToken = ++_loadRequestToken;
    final targetChanged = state.workspaceId != wsId || state.boardId != boardId;
    final cacheKey = _detailCacheKey(wsId: wsId, boardId: boardId);

    if (targetChanged) {
      _invalidateDeletedTasksCache();
    }

    var hasCachedDetail = false;
    if (!forceRefresh) {
      final cached = CacheStore.instance.peek<TaskBoardDetail>(
        key: cacheKey,
        decode: _decodeBoardDetailCache,
      );
      final cachedDetail = cached.data;
      if (cached.hasValue && cachedDetail != null) {
        hasCachedDetail = true;
        final cachedTasksByList = _mergeTaskListSnapshots(
          _groupTasksByKnownLists(cachedDetail.tasks, cachedDetail.lists),
          _filterTasksByKnownLists(
            state.listTasksByListId,
            cachedDetail.lists,
          ),
        );
        final cachedBoard = cachedDetail.copyWith(
          tasks: _flattenTasks(cachedDetail.lists, cachedTasksByList),
        );
        final sanitizedSelectedTaskIds = _sanitizeSelectedTaskIds(
          targetChanged ? const <String>{} : state.selectedTaskIds,
          cachedBoard.tasks,
        );
        emit(
          state.copyWith(
            status: TaskBoardDetailStatus.loaded,
            workspaceId: wsId,
            boardId: boardId,
            board: cachedBoard,
            filters: targetChanged
                ? const TaskBoardDetailFilters()
                : state.filters,
            taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
              cachedBoard.tasks,
            ),
            listTasksByListId: cachedTasksByList,
            loadedListIds: targetChanged
                ? const <String>{}
                : state.loadedListIds,
            loadingListIds: const <String>{},
            listHasMoreById: targetChanged
                ? const <String, bool>{}
                : state.listHasMoreById,
            listOffsetsById: targetChanged
                ? const <String, int>{}
                : state.listOffsetsById,
            listPageSizeById: targetChanged
                ? const <String, int>{}
                : state.listPageSizeById,
            listLoadErrorById: const <String, String>{},
            selectedTaskId: targetChanged ? null : state.selectedTaskId,
            isBulkSelectMode:
                !targetChanged &&
                state.isBulkSelectMode &&
                sanitizedSelectedTaskIds.isNotEmpty,
            selectedTaskIds: sanitizedSelectedTaskIds,
            clearError: true,
          ),
        );

        await _prefetchInitialLists(
          requestToken: requestToken,
          detail: cachedDetail,
        );
        if (cached.isFresh) {
          return;
        }
      }
    }

    if (!hasCachedDetail) {
      emit(
        state.copyWith(
          status: TaskBoardDetailStatus.loading,
          workspaceId: wsId,
          boardId: boardId,
          board: targetChanged ? null : state.board,
          filters: targetChanged
              ? const TaskBoardDetailFilters()
              : state.filters,
          taskDescriptionSearchIndex: targetChanged
              ? const <String, String>{}
              : state.taskDescriptionSearchIndex,
          listTasksByListId: targetChanged
              ? const <String, List<TaskBoardTask>>{}
              : state.listTasksByListId,
          loadedListIds: targetChanged ? const <String>{} : state.loadedListIds,
          loadingListIds: targetChanged
              ? const <String>{}
              : state.loadingListIds,
          listHasMoreById: targetChanged
              ? const <String, bool>{}
              : state.listHasMoreById,
          listOffsetsById: targetChanged
              ? const <String, int>{}
              : state.listOffsetsById,
          listPageSizeById: targetChanged
              ? const <String, int>{}
              : state.listPageSizeById,
          listLoadErrorById: targetChanged
              ? const <String, String>{}
              : state.listLoadErrorById,
          selectedTaskId: targetChanged ? null : state.selectedTaskId,
          isBulkSelectMode: !targetChanged && state.isBulkSelectMode,
          selectedTaskIds: targetChanged
              ? const <String>{}
              : state.selectedTaskIds,
          clearError: true,
        ),
      );
    }

    try {
      final detail = await _taskRepository.getTaskBoardDetail(wsId, boardId);
      if (requestToken != _loadRequestToken) return;

      final retainedTasksByList = _mergeTaskListSnapshots(
        _groupTasksByKnownLists(detail.tasks, detail.lists),
        _filterTasksByKnownLists(
          state.listTasksByListId,
          detail.lists,
        ),
      );
      final nextBoard = detail.copyWith(
        tasks: _flattenTasks(detail.lists, retainedTasksByList),
      );
      final sanitizedSelectedTaskIds = _sanitizeSelectedTaskIds(
        state.selectedTaskIds,
        nextBoard.tasks,
      );

      emit(
        state.copyWith(
          status: TaskBoardDetailStatus.loaded,
          workspaceId: wsId,
          boardId: boardId,
          board: nextBoard,
          selectedTaskIds: sanitizedSelectedTaskIds,
          isBulkSelectMode:
              state.isBulkSelectMode && sanitizedSelectedTaskIds.isNotEmpty,
          taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
            nextBoard.tasks,
          ),
          listTasksByListId: retainedTasksByList,
          loadedListIds: state.loadedListIds.intersection(
            retainedTasksByList.keys.toSet(),
          ),
          loadingListIds: const <String>{},
          listHasMoreById: _filterMapByKeys(
            state.listHasMoreById,
            retainedTasksByList.keys,
          ),
          listOffsetsById: _filterMapByKeys(
            state.listOffsetsById,
            retainedTasksByList.keys,
          ),
          listPageSizeById: _filterMapByKeys(
            state.listPageSizeById,
            retainedTasksByList.keys,
          ),
          listLoadErrorById: const <String, String>{},
          clearError: true,
        ),
      );

      unawaited(
        CacheStore.instance
            .write(
              key: cacheKey,
              policy: _detailCachePolicy,
              payload: detail.toJson(),
              tags: [_detailCacheTag, 'workspace:$wsId', 'module:tasks'],
            )
            .catchError((_) {}),
      );

      await _prefetchInitialLists(requestToken: requestToken, detail: detail);
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;
      if (hasCachedDetail) {
        emit(state.copyWith(error: error.toString()));
        return;
      }
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
    await loadBoardDetail(wsId: wsId, boardId: boardId, forceRefresh: true);
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

    final isListFullyLoaded =
        state.loadedListIds.contains(listId) &&
        !(state.listHasMoreById[listId] ?? true);

    if (!loadMore && !forceRefresh && isListFullyLoaded) {
      return;
    }

    if (loadMore && !(state.listHasMoreById[listId] ?? true)) {
      return;
    }

    final pageSize =
        state.listPageSizeById[listId] ?? _normalizePageSize(pageSizeHint);
    final offset = loadMore ? (state.listOffsetsById[listId] ?? 0) : 0;
    final cacheKey = _listTasksCacheKey(
      wsId: wsId,
      boardId: board.id,
      listId: listId,
      limit: pageSize,
      offset: offset,
    );
    var hasCachedPage = false;

    if (!forceRefresh) {
      final cached = CacheStore.instance.peek<List<TaskBoardTask>>(
        key: cacheKey,
        decode: _decodeListTasksCache,
      );
      final cachedPage = cached.data;
      if (cached.hasValue && cachedPage != null) {
        hasCachedPage = true;
        final applied = _emitListTasksPage(
          requestToken: requestToken,
          wsId: wsId,
          boardId: board.id,
          listId: listId,
          page: cachedPage,
          pageSize: pageSize,
          loadMore: loadMore,
        );
        if (!applied || cached.isFresh) {
          return;
        }
      }
    }

    if (!hasCachedPage) {
      final nextLoading = {...state.loadingListIds, listId};
      final nextLoadErrors = Map<String, String>.from(state.listLoadErrorById)
        ..remove(listId);
      emit(
        state.copyWith(
          loadingListIds: nextLoading,
          listLoadErrorById: nextLoadErrors,
        ),
      );
    }

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
        return;
      }

      _emitListTasksPage(
        requestToken: requestToken,
        wsId: wsId,
        boardId: board.id,
        listId: listId,
        page: page,
        pageSize: pageSize,
        loadMore: loadMore,
      );
      unawaited(
        CacheStore.instance
            .write(
              key: cacheKey,
              policy: _listTasksCachePolicy,
              payload: page
                  .map((task) => task.toJson())
                  .toList(growable: false),
              tags: [
                _listTasksCacheTag,
                _detailCacheTag,
                'workspace:$wsId',
                'module:tasks',
              ],
            )
            .catchError((_) {}),
      );
    } on Exception {
      if (requestToken != _loadRequestToken) {
        return;
      }
      if (state.workspaceId != wsId || state.board?.id != board.id) {
        return;
      }
      final nextLoadingDone = {...state.loadingListIds}..remove(listId);
      final nextLoadErrors = Map<String, String>.from(state.listLoadErrorById)
        ..[listId] = 'list_load_failed';
      emit(
        state.copyWith(
          loadingListIds: nextLoadingDone,
          listLoadErrorById: nextLoadErrors,
        ),
      );
    }
  }

  Future<void> ensureAllListsLoaded() async {
    final board = state.board;
    if (board == null) return;

    for (final list in board.lists) {
      while (state.workspaceId == board.wsId &&
          state.board?.id == board.id &&
          !state.loadingListIds.contains(list.id) &&
          !state.loadedListIds.contains(list.id)) {
        await loadListTasks(listId: list.id, loadMore: true);
        if (state.listLoadErrorById.containsKey(list.id)) {
          break;
        }
      }
    }
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
    final board = state.board;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }

    final pageSizeHint = state.listPageSizeById[listId];
    final sanitizedAssigneeIds = _sanitizeAssigneeIdsForBoard(
      board,
      assigneeIds,
    );

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
        assigneeIds: sanitizedAssigneeIds,
      ),
      reloadBoard: false,
    );

    if (isClosed || state.workspaceId != wsId || state.boardId != board.id) {
      return;
    }

    await loadListTasks(
      listId: listId,
      forceRefresh: true,
      pageSizeHint: pageSizeHint,
    );
  }

  Future<String> uploadTaskDescriptionImage({
    required String wsId,
    required String localFilePath,
    String? taskId,
  }) {
    return _taskRepository.uploadTaskDescriptionImage(
      wsId: wsId,
      localFilePath: localFilePath,
      taskId: taskId,
    );
  }

  Future<void> updateTask({
    required String taskId,
    required String name,
    String? listId,
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
    final board = state.board;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }

    final affectedListId = listId?.trim().isNotEmpty == true
        ? listId!.trim()
        : _findTaskListId(taskId);
    final pageSizeHint = affectedListId == null
        ? null
        : state.listPageSizeById[affectedListId];
    final sanitizedAssigneeIds = _sanitizeAssigneeIdsForBoard(
      board,
      assigneeIds,
    );

    await _runMutation(
      () async {
        await _taskRepository.updateBoardTask(
          wsId: wsId,
          taskId: taskId,
          name: name,
          priority: priority,
          startDate: startDate,
          endDate: endDate,
          estimationPoints: estimationPoints,
          labelIds: labelIds,
          projectIds: projectIds,
          assigneeIds: sanitizedAssigneeIds,
          clearStartDate: clearStartDate,
          clearEndDate: clearEndDate,
          clearEstimationPoints: clearEstimationPoints,
        );

        if (description != null || clearDescription) {
          await _taskRepository.updateTaskDescription(
            wsId: wsId,
            taskId: taskId,
            description: clearDescription ? null : description,
          );
        }

        return null;
      },
      reloadBoard: false,
    );

    if (isClosed || state.workspaceId != wsId || state.boardId != board.id) {
      return;
    }

    if (affectedListId == null) {
      await loadBoardDetail(wsId: wsId, boardId: board.id, forceRefresh: true);
      return;
    }

    await loadListTasks(
      listId: affectedListId,
      forceRefresh: true,
      pageSizeHint: pageSizeHint,
    );
  }

  Future<void> updateTaskDescriptionRealtime({
    required String taskId,
    required String? description,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    final board = state.board;
    if (wsId == null || boardId == null || board == null) {
      throw StateError('Board detail is not initialized');
    }

    await _taskRepository.updateTaskDescription(
      wsId: wsId,
      taskId: taskId,
      description: description,
    );

    if (state.workspaceId != wsId || state.boardId != boardId) {
      return;
    }

    final currentBoard = state.board;
    if (currentBoard == null) {
      return;
    }

    var taskFound = false;
    final nextTasks = currentBoard.tasks
        .map((task) {
          if (task.id != taskId) {
            return task;
          }
          taskFound = true;
          return task.copyWith(description: description);
        })
        .toList(growable: false);

    if (!taskFound) {
      return;
    }

    final nextBoard = currentBoard.copyWith(tasks: nextTasks);
    final nextTasksByList = _mergeCurrentBoardTaskSnapshots(
      board: nextBoard,
      tasksByList: state.listTasksByListId,
    );
    final finalBoard = nextBoard.copyWith(
      tasks: _flattenTasks(nextBoard.lists, nextTasksByList),
    );

    emit(
      state.copyWith(
        board: finalBoard,
        taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
          finalBoard.tasks,
        ),
        listTasksByListId: nextTasksByList,
      ),
    );
  }

  Future<void> moveTask({
    required String taskId,
    required String listId,
  }) async {
    final wsId = state.workspaceId;
    final board = state.board;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }

    final sourceListId = _findTaskListId(taskId);
    if (sourceListId == listId) {
      return;
    }
    final pageSizeHints = <String, int?>{
      if (sourceListId != null)
        sourceListId: state.listPageSizeById[sourceListId],
      listId: state.listPageSizeById[listId],
    };

    await _runMutation(
      () => _taskRepository.moveBoardTask(
        wsId: wsId,
        taskId: taskId,
        listId: listId,
      ),
      reloadBoard: false,
    );

    if (isClosed || state.workspaceId != wsId || state.boardId != board.id) {
      return;
    }

    final affectedListIds = <String>{
      if (sourceListId != null) sourceListId,
      listId,
    };
    for (final affectedListId in affectedListIds) {
      await loadListTasks(
        listId: affectedListId,
        forceRefresh: true,
        pageSizeHint: pageSizeHints[affectedListId],
      );
    }
  }

  Future<void> deleteTask({required String taskId}) async {
    final wsId = state.workspaceId;
    final board = state.board;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }

    final sourceListId = _findTaskListId(taskId);
    final pageSizeHint = sourceListId == null
        ? null
        : state.listPageSizeById[sourceListId];

    await _runMutation(
      () => _taskRepository.deleteTask(taskId, wsId: wsId),
      reloadBoard: false,
    );

    _invalidateDeletedTasksCache();

    if (sourceListId == null || isClosed) {
      return;
    }

    if (state.workspaceId != wsId || state.boardId != board.id) {
      return;
    }

    emit(
      state.copyWith(
        selectedTaskId: state.selectedTaskId == taskId
            ? null
            : state.selectedTaskId,
        selectedTaskIds: state.selectedTaskIds
            .where((id) => id != taskId)
            .toSet(),
      ),
    );

    await loadListTasks(
      listId: sourceListId,
      forceRefresh: true,
      pageSizeHint: pageSizeHint,
    );
  }

  Future<List<TaskBoardTask>> loadDeletedTasks({
    int limit = 100,
    int offset = 0,
    bool forceRefresh = false,
  }) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;
    final board = state.board;
    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    if (!forceRefresh) {
      final cached = _getCachedDeletedTasks(
        wsId: wsId,
        boardId: boardId,
        limit: limit,
        offset: offset,
      );
      if (cached != null) {
        return cached;
      }
    }

    final tasks = await _taskRepository.getDeletedBoardTasks(
      wsId,
      boardId: boardId,
      limit: limit,
      offset: offset,
      labels: board?.labels ?? const [],
      projects: board?.projects ?? const [],
    );

    if (offset == 0) {
      _cacheDeletedTasks(wsId: wsId, boardId: boardId, tasks: tasks);
    }

    return tasks;
  }

  Future<void> restoreTask({
    required String taskId,
    bool reloadBoard = true,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.restoreTask(wsId: wsId, taskId: taskId),
      reloadBoard: reloadBoard,
    );

    _removeFromDeletedTasksCache(taskId);
  }

  Future<void> permanentlyDeleteTask({
    required String taskId,
    bool reloadBoard = true,
  }) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }

    await _runMutation(
      () => _taskRepository.permanentlyDeleteTask(wsId: wsId, taskId: taskId),
      reloadBoard: reloadBoard,
    );

    _removeFromDeletedTasksCache(taskId);
  }

  List<TaskBoardTask>? _getCachedDeletedTasks({
    required String wsId,
    required String boardId,
    required int limit,
    required int offset,
  }) {
    final cached = _cachedDeletedTasks;
    final cachedAt = _cachedDeletedTasksAt;
    if (cached == null || cachedAt == null) {
      return null;
    }
    if (_cachedDeletedTasksWorkspaceId != wsId ||
        _cachedDeletedTasksBoardId != boardId) {
      return null;
    }
    if (DateTime.now().difference(cachedAt) > _deletedTasksCacheTtl) {
      return null;
    }
    if (offset < 0 || limit <= 0 || offset > cached.length) {
      return null;
    }

    final end = (offset + limit).clamp(offset, cached.length);
    return List<TaskBoardTask>.unmodifiable(cached.sublist(offset, end));
  }

  void _cacheDeletedTasks({
    required String wsId,
    required String boardId,
    required List<TaskBoardTask> tasks,
  }) {
    _cachedDeletedTasks = List<TaskBoardTask>.unmodifiable(tasks);
    _cachedDeletedTasksAt = DateTime.now();
    _cachedDeletedTasksWorkspaceId = wsId;
    _cachedDeletedTasksBoardId = boardId;
  }

  void _removeFromDeletedTasksCache(String taskId) {
    final cached = _cachedDeletedTasks;
    if (cached == null) {
      return;
    }
    _cachedDeletedTasks = List<TaskBoardTask>.unmodifiable(
      cached.where((task) => task.id != taskId),
    );
    _cachedDeletedTasksAt = DateTime.now();
  }

  void _invalidateDeletedTasksCache() {
    _cachedDeletedTasks = null;
    _cachedDeletedTasksAt = null;
    _cachedDeletedTasksWorkspaceId = null;
    _cachedDeletedTasksBoardId = null;
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

    final nextBoard = board.copyWith(tasks: nextTasks);
    final nextTasksByList = _mergeCurrentBoardTaskSnapshots(
      board: nextBoard,
      tasksByList: state.listTasksByListId,
    );

    final finalBoard = nextBoard.copyWith(
      tasks: _flattenTasks(nextBoard.lists, nextTasksByList),
    );

    emit(
      state.copyWith(
        board: finalBoard,
        taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
          finalBoard.tasks,
        ),
        listTasksByListId: nextTasksByList,
      ),
    );
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

  Future<List<TaskBoardSummary>> getTaskBoards() async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    final page = await _taskRepository.getTaskBoards(wsId, pageSize: 200);
    return page.boards;
  }

  Future<List<TaskBoardList>> getBoardListsForBoard(String boardId) async {
    final wsId = state.workspaceId;
    if (wsId == null) {
      throw StateError('Workspace not selected');
    }
    return _taskRepository.getBoardLists(wsId, boardId);
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
    if (view == TaskBoardDetailView.timeline) {
      unawaited(ensureAllListsLoaded());
    }
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

  void enterBulkSelectMode({String? initialTaskId}) {
    final board = state.board;
    if (board == null) return;

    var nextSelected = _sanitizeSelectedTaskIds(
      state.selectedTaskIds,
      board.tasks,
    );
    if (initialTaskId != null && initialTaskId.trim().isNotEmpty) {
      final targetId = initialTaskId.trim();
      final exists = board.tasks.any((task) => task.id == targetId);
      if (exists) {
        nextSelected = {...nextSelected, targetId};
      }
    }

    emit(
      state.copyWith(
        isBulkSelectMode: true,
        selectedTaskIds: nextSelected,
      ),
    );
  }

  void exitBulkSelectMode() {
    emit(
      state.copyWith(
        isBulkSelectMode: false,
        selectedTaskIds: const <String>{},
      ),
    );
  }

  void toggleBulkTaskSelection(String taskId, {bool? selected}) {
    final board = state.board;
    if (board == null) return;
    if (!board.tasks.any((task) => task.id == taskId)) {
      return;
    }

    final next = Set<String>.from(state.selectedTaskIds);
    final shouldSelect = selected ?? !next.contains(taskId);
    if (shouldSelect) {
      next.add(taskId);
    } else {
      next.remove(taskId);
    }

    emit(
      state.copyWith(
        selectedTaskIds: next,
        isBulkSelectMode: next.isNotEmpty,
      ),
    );
  }

  void selectAllFilteredTasks() {
    final board = state.board;
    if (board == null) return;
    final ids = state.filteredTasks.map((task) => task.id).toSet();
    if (ids.isEmpty) return;
    emit(
      state.copyWith(
        isBulkSelectMode: true,
        selectedTaskIds: _sanitizeSelectedTaskIds(
          ids,
          board.tasks,
        ),
      ),
    );
  }

  Future<TaskBulkResult> bulkUpdatePriority(String? priority) {
    return _runBulkOperation(
      TaskBulkOperation.updateFields({'priority': priority}),
    );
  }

  Future<TaskBulkResult> bulkUpdateEstimation(int? estimationPoints) {
    return _runBulkOperation(
      TaskBulkOperation.updateFields({'estimation_points': estimationPoints}),
    );
  }

  Future<TaskBulkResult> bulkUpdateCustomDueDate(DateTime? date) {
    final endOfDay = date == null
        ? null
        : _endOfDay(date).toUtc().toIso8601String();
    return _runBulkOperation(
      TaskBulkOperation.updateFields({'end_date': endOfDay}),
    );
  }

  Future<TaskBulkResult> bulkUpdateDueDatePreset(
    String preset, {
    int weekStartsOn = DateTime.monday,
  }) {
    final normalizedPreset = preset.trim().toLowerCase();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    DateTime? targetDate;
    switch (normalizedPreset) {
      case 'today':
        targetDate = today;
      case 'tomorrow':
        targetDate = today.add(const Duration(days: 1));
      case 'this_week':
        final offset = (today.weekday - weekStartsOn + 7) % 7;
        final weekStart = today.subtract(Duration(days: offset));
        targetDate = weekStart.add(const Duration(days: 6));
      case 'next_week':
        final offset = (today.weekday - weekStartsOn + 7) % 7;
        final weekStart = today.subtract(Duration(days: offset));
        targetDate = weekStart.add(const Duration(days: 13));
      case 'clear':
        targetDate = null;
      default:
        throw ArgumentError('Unsupported due date preset: $preset');
    }

    final value = targetDate == null
        ? null
        : _endOfDay(targetDate).toUtc().toIso8601String();
    return _runBulkOperation(
      TaskBulkOperation.updateFields({'end_date': value}),
    );
  }

  Future<TaskBulkResult> bulkMoveToList({
    required String listId,
    String? targetBoardId,
  }) {
    return _runBulkOperation(
      TaskBulkOperation.moveToList(
        listId: listId,
        targetBoardId: targetBoardId,
      ),
    );
  }

  Future<TaskBulkResult> bulkMoveToStatus(String status) {
    final board = state.board;
    if (board == null) {
      throw StateError('Board detail is not initialized');
    }
    final normalizedStatus = TaskBoardList.normalizeSupportedStatus(status);
    if (normalizedStatus == null) {
      throw ArgumentError('Unsupported status: $status');
    }

    TaskBoardList? target;
    for (final list in board.lists) {
      if (TaskBoardList.normalizeSupportedStatus(list.status) ==
          normalizedStatus) {
        target = list;
        break;
      }
    }

    if (target == null) {
      throw StateError('No list available for status: $status');
    }

    return bulkMoveToList(listId: target.id);
  }

  Future<TaskBulkResult> bulkDeleteSelectedTasks() async {
    const deleteUpdates = {'deleted': true};
    final result = await _runBulkOperation(
      TaskBulkOperation.updateFields(deleteUpdates),
    );
    _invalidateDeletedTasksCache();
    return result;
  }

  Future<TaskBulkResult> bulkAddLabel(String labelId) {
    return _runBulkOperation(TaskBulkOperation.addLabel(labelId));
  }

  Future<TaskBulkResult> bulkRemoveLabel(String labelId) {
    return _runBulkOperation(TaskBulkOperation.removeLabel(labelId));
  }

  Future<TaskBulkResult> bulkClearLabels() {
    return _runBulkOperation(TaskBulkOperation.clearLabels);
  }

  Future<TaskBulkResult> bulkAddProject(String projectId) {
    return _runBulkOperation(TaskBulkOperation.addProject(projectId));
  }

  Future<TaskBulkResult> bulkRemoveProject(String projectId) {
    return _runBulkOperation(TaskBulkOperation.removeProject(projectId));
  }

  Future<TaskBulkResult> bulkClearProjects() {
    return _runBulkOperation(TaskBulkOperation.clearProjects);
  }

  Future<TaskBulkResult> bulkAddAssignee(String assigneeId) {
    return _runBulkOperation(TaskBulkOperation.addAssignee(assigneeId));
  }

  Future<TaskBulkResult> bulkRemoveAssignee(String assigneeId) {
    return _runBulkOperation(TaskBulkOperation.removeAssignee(assigneeId));
  }

  Future<TaskBulkResult> bulkClearAssignees() {
    return _runBulkOperation(TaskBulkOperation.clearAssignees);
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
    String? name,
    String? status,
    String? color,
    int? position,
    bool? deleted,
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
        position: position,
        deleted: deleted,
      ),
    );
  }

  Future<void> reorderListsPositions({
    required Map<String, int> updates,
  }) async {
    if (updates.isEmpty) return;

    final wsId = state.workspaceId;
    final boardId = state.boardId;
    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }

    await _runMutation(() async {
      try {
        await Future.wait(
          updates.entries.map(
            (entry) => _taskRepository.updateBoardList(
              wsId: wsId,
              boardId: boardId,
              listId: entry.key,
              position: entry.value,
            ),
          ),
        );
      } finally {
        if (!isClosed &&
            state.workspaceId == wsId &&
            state.boardId == boardId) {
          await loadBoardDetail(wsId: wsId, boardId: boardId);
        }
      }
      return null;
    }, reloadBoard: false);
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

      await _invalidateBoardCaches(wsId: wsId);

      emit(
        state.copyWith(
          isMutating: false,
          clearMutationError: true,
          clearError: true,
        ),
      );

      if (reloadBoard) {
        await loadBoardDetail(
          wsId: wsId,
          boardId: boardId,
          forceRefresh: true,
        );
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

  Future<TaskBulkResult> _runBulkOperation(
    TaskBulkOperation operation,
  ) async {
    final wsId = state.workspaceId;
    final boardId = state.boardId;

    if (wsId == null || boardId == null) {
      throw StateError('Board detail is not initialized');
    }
    if (state.isMutating) {
      throw StateError('Another mutation is already in progress');
    }

    final selectedTaskIds = state.selectedTaskIds.toList(growable: false);
    if (selectedTaskIds.isEmpty) {
      throw StateError('No tasks selected for bulk operation');
    }

    emit(
      state.copyWith(
        isMutating: true,
        clearMutationError: true,
        clearError: true,
      ),
    );

    try {
      final result = await _taskRepository.bulkBoardTasks(
        wsId: wsId,
        taskIds: selectedTaskIds,
        operation: operation,
      );

      if (isClosed) {
        return result;
      }

      if (state.workspaceId != wsId || state.boardId != boardId) {
        if (!isClosed) {
          emit(
            state.copyWith(
              isMutating: false,
              clearMutationError: true,
              clearError: true,
            ),
          );
        }
        return result;
      }

      final failedTaskIds = result.failures
          .map((failure) => failure.taskId)
          .where((id) => id.trim().isNotEmpty)
          .toSet();
      final nextSelectedTaskIds = failedTaskIds.isEmpty
          ? const <String>{}
          : state.selectedTaskIds.where(failedTaskIds.contains).toSet();

      emit(
        state.copyWith(
          isMutating: false,
          selectedTaskIds: nextSelectedTaskIds,
          isBulkSelectMode: nextSelectedTaskIds.isNotEmpty,
          clearMutationError: true,
          clearError: true,
        ),
      );

      await _invalidateBoardCaches(wsId: wsId);

      await loadBoardDetail(
        wsId: wsId,
        boardId: boardId,
        forceRefresh: true,
      );
      return result;
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

  String? _findTaskListId(String taskId) {
    final board = state.board;
    if (board == null) return null;

    for (final task in board.tasks) {
      if (task.id == taskId) {
        return task.listId;
      }
    }

    for (final entry in state.listTasksByListId.entries) {
      for (final task in entry.value) {
        if (task.id == taskId) {
          return task.listId;
        }
      }
    }

    return null;
  }

  List<String>? _sanitizeAssigneeIdsForBoard(
    TaskBoardDetail board,
    List<String>? assigneeIds,
  ) {
    if (assigneeIds == null) {
      return null;
    }

    final memberIds = board.members.map((member) => member.id).toSet();
    if (memberIds.isEmpty) {
      return const <String>[];
    }

    final sanitized =
        assigneeIds
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty && memberIds.contains(id))
            .toSet()
            .toList(growable: false)
          ..sort();
    return sanitized;
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
      if (requestToken == _loadRequestToken &&
          state.workspaceId == detail.wsId &&
          state.board?.id == detail.id &&
          !state.loadingListIds.contains(listId) &&
          !state.loadedListIds.contains(listId)) {
        await loadListTasks(
          listId: listId,
          loadMore: state.listTasksByListId.containsKey(listId),
        );
        if (requestToken != _loadRequestToken) {
          return;
        }
        if (state.listLoadErrorById.containsKey(listId)) {
          break;
        }
      }
    }
  }

  Future<void> _invalidateBoardCaches({required String wsId}) {
    return CacheStore.instance.invalidateTags(
      [_detailCacheTag, _listTasksCacheTag],
      workspaceId: wsId,
    );
  }

  bool _emitListTasksPage({
    required int requestToken,
    required String wsId,
    required String boardId,
    required String listId,
    required List<TaskBoardTask> page,
    required int pageSize,
    required bool loadMore,
  }) {
    if (requestToken != _loadRequestToken ||
        state.workspaceId != wsId ||
        state.board?.id != boardId) {
      return false;
    }

    final board = state.board;
    if (board == null) {
      return false;
    }

    final existing = loadMore
        ? (state.listTasksByListId[listId] ?? const <TaskBoardTask>[])
        : const <TaskBoardTask>[];
    final merged = _mergeTaskPages(existing, page);
    final baseTasksByList = Map<String, List<TaskBoardTask>>.from(
      state.listTasksByListId,
    )..[listId] = List.unmodifiable(merged);
    final nextTasksByList = _mergeCurrentBoardTaskSnapshots(
      board: board,
      tasksByList: baseTasksByList,
    );
    final nextLoadingDone = {...state.loadingListIds}..remove(listId);
    final listHasMore = page.length >= pageSize;
    final nextHasMore = Map<String, bool>.from(state.listHasMoreById)
      ..[listId] = listHasMore;
    final nextOffsets = Map<String, int>.from(state.listOffsetsById)
      ..[listId] = merged.length;
    final nextPageSizes = Map<String, int>.from(state.listPageSizeById)
      ..[listId] = pageSize;
    final nextLoaded = Set<String>.from(state.loadedListIds);
    if (listHasMore) {
      nextLoaded.remove(listId);
    } else {
      nextLoaded.add(listId);
    }
    final nextLoadErrors = Map<String, String>.from(state.listLoadErrorById)
      ..remove(listId);
    final nextBoard = board.copyWith(
      tasks: _flattenTasks(board.lists, nextTasksByList),
    );
    final sanitizedSelectedTaskIds = _sanitizeSelectedTaskIds(
      state.selectedTaskIds,
      nextBoard.tasks,
    );

    emit(
      state.copyWith(
        board: nextBoard,
        selectedTaskIds: sanitizedSelectedTaskIds,
        isBulkSelectMode:
            state.isBulkSelectMode && sanitizedSelectedTaskIds.isNotEmpty,
        taskDescriptionSearchIndex: _buildTaskDescriptionSearchIndex(
          nextBoard.tasks,
        ),
        listTasksByListId: nextTasksByList,
        loadedListIds: nextLoaded,
        loadingListIds: nextLoadingDone,
        listHasMoreById: nextHasMore,
        listOffsetsById: nextOffsets,
        listPageSizeById: nextPageSizes,
        listLoadErrorById: nextLoadErrors,
      ),
    );
    return true;
  }

  static Set<String> _sanitizeSelectedTaskIds(
    Set<String> selectedTaskIds,
    Iterable<TaskBoardTask> tasks,
  ) {
    if (selectedTaskIds.isEmpty) {
      return const <String>{};
    }
    final visibleTaskIds = tasks.map((task) => task.id).toSet();
    return selectedTaskIds.where(visibleTaskIds.contains).toSet();
  }

  static DateTime _endOfDay(DateTime date) {
    return DateTime(
      date.year,
      date.month,
      date.day,
      23,
      59,
      59,
      999,
    );
  }

  static Map<String, List<TaskBoardTask>> _mergeCurrentBoardTaskSnapshots({
    required TaskBoardDetail board,
    required Map<String, List<TaskBoardTask>> tasksByList,
  }) {
    if (tasksByList.isEmpty || board.tasks.isEmpty) {
      return tasksByList;
    }

    final taskById = <String, TaskBoardTask>{
      for (final task in board.tasks) task.id: task,
    };

    final next = <String, List<TaskBoardTask>>{};
    for (final entry in tasksByList.entries) {
      final mergedForList = entry.value
          .map((task) => taskById[task.id] ?? task)
          .toList(growable: false);
      next[entry.key] = List.unmodifiable(mergedForList);
    }

    return Map.unmodifiable(next);
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

  static Map<String, List<TaskBoardTask>> _filterTasksByKnownLists(
    Map<String, List<TaskBoardTask>> tasksByList,
    List<TaskBoardList> lists,
  ) {
    final knownListIds = lists.map((list) => list.id).toSet();
    final next = <String, List<TaskBoardTask>>{};
    for (final entry in tasksByList.entries) {
      if (knownListIds.contains(entry.key)) {
        next[entry.key] = List.unmodifiable(entry.value);
      }
    }
    return Map.unmodifiable(next);
  }

  static Map<String, List<TaskBoardTask>> _groupTasksByKnownLists(
    Iterable<TaskBoardTask> tasks,
    List<TaskBoardList> lists,
  ) {
    final knownListIds = lists.map((list) => list.id).toSet();
    final next = <String, List<TaskBoardTask>>{};
    for (final task in tasks) {
      if (!knownListIds.contains(task.listId)) {
        continue;
      }
      next.putIfAbsent(task.listId, () => <TaskBoardTask>[]).add(task);
    }
    return Map.unmodifiable(
      next.map(
        (listId, listTasks) => MapEntry(
          listId,
          List<TaskBoardTask>.unmodifiable(listTasks),
        ),
      ),
    );
  }

  static Map<String, List<TaskBoardTask>> _mergeTaskListSnapshots(
    Map<String, List<TaskBoardTask>> base,
    Map<String, List<TaskBoardTask>> overlay,
  ) {
    if (base.isEmpty) return overlay;
    if (overlay.isEmpty) return base;
    return Map.unmodifiable({
      ...base,
      ...overlay,
    });
  }

  static Map<String, T> _filterMapByKeys<T>(
    Map<String, T> source,
    Iterable<String> keys,
  ) {
    final keySet = keys.toSet();
    final next = <String, T>{};
    for (final entry in source.entries) {
      if (keySet.contains(entry.key)) {
        next[entry.key] = entry.value;
      }
    }
    return Map.unmodifiable(next);
  }
}
