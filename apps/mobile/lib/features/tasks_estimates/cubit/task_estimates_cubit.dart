import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_estimates_state.dart';

class TaskEstimatesCubit extends Cubit<TaskEstimatesState> {
  TaskEstimatesCubit({
    required TaskRepository taskRepository,
    TaskEstimatesState? initialState,
  }) : _taskRepository = taskRepository,
       super(initialState ?? const TaskEstimatesState());

  final TaskRepository _taskRepository;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'tasks:estimates';
  String? _lastLoadWsId;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task estimates cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'tasks.estimates',
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
        final boards = await taskRepository.getTaskEstimateBoards(wsId);
        return {
          'boards': boards
              .map((board) => board.toJson())
              .toList(growable: false),
        };
      },
    );
  }

  static TaskEstimatesState? seedStateFor(String wsId) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    return TaskEstimatesState(
      status: TaskEstimatesStatus.loaded,
      boards: ((json['boards'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TaskEstimateBoard.fromJson)
          .toList(growable: false),
    );
  }

  Future<void> loadBoards(String wsId) async {
    _lastLoadWsId = wsId;
    final cacheKey = _cacheKey(wsId);
    final cached = await CacheStore.instance.read<Map<String, dynamic>>(
      key: cacheKey,
      decode: _decodeCacheJson,
    );
    if (cached.hasValue) {
      final json = cached.data!;
      emit(
        state.copyWith(
          status: TaskEstimatesStatus.loaded,
          boards: ((json['boards'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TaskEstimateBoard.fromJson)
              .toList(growable: false),
          error: null,
        ),
      );
      if (cached.isFresh) {
        return;
      }
    }
    emit(state.copyWith(status: TaskEstimatesStatus.loading, error: null));

    try {
      final boards = await _taskRepository.getTaskEstimateBoards(wsId);
      if (_lastLoadWsId != wsId) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.loaded,
          boards: boards,
          error: null,
        ),
      );
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: {
          'boards': boards
              .map((board) => board.toJson())
              .toList(growable: false),
        },
        tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      );
    } on Exception catch (error) {
      if (_lastLoadWsId != wsId) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> updateBoardEstimation({
    required String wsId,
    required String boardId,
    required String? estimationType,
    required bool extendedEstimation,
    required bool allowZeroEstimates,
    required bool countUnestimatedIssues,
  }) async {
    final currentWsId = _lastLoadWsId;
    emit(state.copyWith(status: TaskEstimatesStatus.updating, error: null));

    try {
      final updatedBoard = await _taskRepository.updateBoardEstimation(
        wsId: wsId,
        boardId: boardId,
        estimationType: estimationType,
        extendedEstimation: extendedEstimation,
        allowZeroEstimates: allowZeroEstimates,
        countUnestimatedIssues: countUnestimatedIssues,
      );

      if (_lastLoadWsId != currentWsId) {
        return;
      }

      if (_lastLoadWsId != wsId) {
        return;
      }

      final boards = state.boards
          .map(
            (board) => board.id == boardId
                ? board.copyWith(
                    estimationType: updatedBoard.estimationType,
                    extendedEstimation: updatedBoard.extendedEstimation,
                    allowZeroEstimates: updatedBoard.allowZeroEstimates,
                    countUnestimatedIssues: updatedBoard.countUnestimatedIssues,
                  )
                : board,
          )
          .toList(growable: false);

      emit(
        state.copyWith(
          status: TaskEstimatesStatus.loaded,
          boards: boards,
          error: null,
        ),
      );
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskEstimatesStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }
}
