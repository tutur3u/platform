import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/task_board_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_boards_state.dart';

class TaskBoardsCubit extends Cubit<TaskBoardsState> {
  TaskBoardsCubit({
    required TaskRepository taskRepository,
    TaskBoardsState? initialState,
  }) : _taskRepository = taskRepository,
       super(initialState ?? const TaskBoardsState());

  final TaskRepository _taskRepository;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'tasks:boards';
  int _loadRequestToken = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task boards cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'tasks.boards',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static Future<void> prewarm({
    required TaskRepository taskRepository,
    required String wsId,
    bool forceRefresh = false,
  }) async {
    await CacheStore.instance.prefetch<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      policy: _cachePolicy,
      decode: _decodeCacheJson,
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      fetch: () async {
        final pageData = await taskRepository.getTaskBoards(wsId);
        return {
          'boards': pageData.boards
              .map((board) => board.toJson())
              .toList(growable: false),
          'totalCount': pageData.totalCount,
          'page': pageData.page,
          'pageSize': pageData.pageSize,
        };
      },
    );
  }

  static TaskBoardsState? seedStateFor(String wsId) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    return TaskBoardsState(
      status: TaskBoardsStatus.loaded,
      workspaceId: wsId,
      currentPage: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['pageSize'] as num?)?.toInt() ?? 20,
      totalCount: (json['totalCount'] as num?)?.toInt() ?? 0,
      boards: ((json['boards'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TaskBoardSummary.fromSummaryJson)
          .toList(growable: false),
    );
  }

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
    bool forceRefresh = false,
  }) async {
    final requestToken = ++_loadRequestToken;
    final workspaceChanged = state.workspaceId != wsId;
    final cacheKey = _cacheKey(wsId);
    final normalizedPage = page < 1 ? 1 : page;
    final normalizedPageSize = (pageSize ?? state.pageSize).clamp(1, 200);
    final isLoadingMore =
        !reset && !workspaceChanged && state.boards.isNotEmpty;
    var hasCachedReset = false;

    if (reset && !forceRefresh) {
      final cached = await CacheStore.instance.read<Map<String, dynamic>>(
        key: cacheKey,
        decode: _decodeCacheJson,
      );
      if (cached.hasValue) {
        hasCachedReset = true;
        final json = cached.data!;
        emit(
          state.copyWith(
            status: TaskBoardsStatus.loaded,
            workspaceId: wsId,
            currentPage: (json['page'] as num?)?.toInt() ?? 1,
            pageSize: (json['pageSize'] as num?)?.toInt() ?? normalizedPageSize,
            totalCount: (json['totalCount'] as num?)?.toInt() ?? 0,
            boards: ((json['boards'] as List<dynamic>?) ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(TaskBoardSummary.fromSummaryJson)
                .toList(growable: false),
            isLoadingMore: false,
            clearError: true,
          ),
        );
        if (cached.isFresh) {
          return;
        }
      }
    }

    emit(
      state.copyWith(
        status: hasCachedReset || isLoadingMore
            ? state.status
            : TaskBoardsStatus.loading,
        workspaceId: wsId,
        currentPage: normalizedPage,
        pageSize: normalizedPageSize,
        totalCount: hasCachedReset || (!reset && !workspaceChanged)
            ? state.totalCount
            : 0,
        boards: hasCachedReset || (!reset && !workspaceChanged)
            ? state.boards
            : const [],
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
      if (reset) {
        await CacheStore.instance.write(
          key: cacheKey,
          policy: _cachePolicy,
          payload: {
            'boards': pageData.boards
                .map((board) => board.toJson())
                .toList(growable: false),
            'totalCount': pageData.totalCount,
            'page': pageData.page,
            'pageSize': pageData.pageSize,
          },
          tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
        );
      }
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;
      if (hasCachedReset) {
        emit(
          state.copyWith(
            status: TaskBoardsStatus.loaded,
            workspaceId: wsId,
            isLoadingMore: false,
            error: error.toString(),
          ),
        );
        return;
      }
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
      await CacheStore.instance.invalidateTags([_cacheTag], workspaceId: wsId);
      await _loadBoardsForPage(
        wsId,
        page: 1,
        pageSize: state.pageSize,
        reset: true,
        forceRefresh: true,
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
