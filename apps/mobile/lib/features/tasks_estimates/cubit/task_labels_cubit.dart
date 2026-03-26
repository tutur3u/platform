import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_labels_state.dart';

class TaskLabelsCubit extends Cubit<TaskLabelsState> {
  TaskLabelsCubit({
    required TaskRepository taskRepository,
    TaskLabelsState? initialState,
  }) : _taskRepository = taskRepository,
       super(initialState ?? const TaskLabelsState());

  final TaskRepository _taskRepository;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'tasks:labels';
  String? _lastLoadWsId;
  int _currentRequestToken = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task labels cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'tasks.labels',
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
        final labels = await taskRepository.getTaskLabels(wsId);
        return {
          'labels': labels
              .map((label) => label.toJson())
              .toList(growable: false),
        };
      },
    );
  }

  static TaskLabelsState? seedStateFor(String wsId) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    return TaskLabelsState(
      status: TaskLabelsStatus.loaded,
      wsId: wsId,
      labels: ((json['labels'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TaskLabel.fromJson)
          .toList(growable: false),
    );
  }

  Future<void> loadLabels(String wsId) async {
    final token = ++_currentRequestToken;
    final shouldReplaceLabels = state.wsId != wsId;
    final cacheKey = _cacheKey(wsId);
    _lastLoadWsId = wsId;
    final cached = await CacheStore.instance.read<Map<String, dynamic>>(
      key: cacheKey,
      decode: _decodeCacheJson,
    );
    if (cached.hasValue) {
      final json = cached.data!;
      emit(
        state.copyWith(
          status: TaskLabelsStatus.loaded,
          error: null,
          wsId: wsId,
          requestToken: token,
          labels: ((json['labels'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TaskLabel.fromJson)
              .toList(growable: false),
        ),
      );
      if (cached.isFresh) {
        return;
      }
    }
    emit(
      state.copyWith(
        status: TaskLabelsStatus.loading,
        error: null,
        wsId: wsId,
        requestToken: token,
        labels: shouldReplaceLabels ? const <TaskLabel>[] : state.labels,
      ),
    );

    try {
      final labels = await _taskRepository.getTaskLabels(wsId);
      if (_lastLoadWsId != wsId ||
          state.wsId != wsId ||
          state.requestToken != token) {
        return;
      }

      emit(
        state.copyWith(
          status: TaskLabelsStatus.loaded,
          labels: labels,
          error: null,
          wsId: wsId,
          requestToken: token,
        ),
      );
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: {
          'labels': labels
              .map((label) => label.toJson())
              .toList(growable: false),
        },
        tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      );
    } on Exception catch (error) {
      if (_lastLoadWsId != wsId ||
          state.wsId != wsId ||
          state.requestToken != token) {
        return;
      }
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
          wsId: wsId,
          requestToken: token,
        ),
      );
    }
  }

  Future<void> createLabel({
    required String wsId,
    required String name,
    required String color,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.createTaskLabel(
        wsId: wsId,
        name: name,
        color: color,
      );
      if (_lastLoadWsId != wsId || state.wsId != wsId) {
        return;
      }
      await loadLabels(wsId);
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }

  Future<void> updateLabel({
    required String wsId,
    required String labelId,
    required String name,
    required String color,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.updateTaskLabel(
        wsId: wsId,
        labelId: labelId,
        name: name,
        color: color,
      );
      if (_lastLoadWsId != wsId || state.wsId != wsId) {
        return;
      }
      await loadLabels(wsId);
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }

  Future<void> deleteLabel({
    required String wsId,
    required String labelId,
  }) async {
    emit(state.copyWith(status: TaskLabelsStatus.saving, error: null));
    try {
      await _taskRepository.deleteTaskLabel(wsId: wsId, labelId: labelId);
      if (_lastLoadWsId != wsId || state.wsId != wsId) {
        return;
      }
      final filtered = state.labels
          .where((label) => label.id != labelId)
          .toList(growable: false);
      emit(
        state.copyWith(
          status: TaskLabelsStatus.loaded,
          labels: filtered,
          error: null,
        ),
      );
    } on Exception catch (error) {
      emit(
        state.copyWith(
          status: TaskLabelsStatus.error,
          error: error.toString(),
        ),
      );
      rethrow;
    }
  }
}
