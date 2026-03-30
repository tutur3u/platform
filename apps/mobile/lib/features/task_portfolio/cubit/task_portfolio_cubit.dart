import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_portfolio_state.dart';

class TaskPortfolioCubit extends Cubit<TaskPortfolioState> {
  TaskPortfolioCubit({
    required TaskRepository taskRepository,
    TaskPortfolioState? initialState,
  }) : _taskRepository = taskRepository,
       super(initialState ?? const TaskPortfolioState());

  final TaskRepository _taskRepository;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'tasks:portfolio';
  int _loadRequestToken = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task portfolio cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey(String wsId) {
    return CacheKey(
      namespace: 'tasks.portfolio',
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
        final projectsFuture = taskRepository.getTaskProjects(wsId);
        final initiativesFuture = taskRepository.getTaskInitiatives(wsId);
        final projects = await projectsFuture;
        final initiatives = await initiativesFuture;
        return {
          'projects': projects
              .map((project) => project.toJson())
              .toList(growable: false),
          'initiatives': initiatives
              .map((initiative) => initiative.toJson())
              .toList(growable: false),
        };
      },
    );
  }

  static TaskPortfolioState? seedStateFor(String wsId) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(wsId),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    return TaskPortfolioState(
      status: TaskPortfolioStatus.loaded,
      workspaceId: wsId,
      projects: ((json['projects'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TaskProjectSummary.fromJson)
          .toList(growable: false),
      initiatives:
          ((json['initiatives'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TaskInitiativeSummary.fromJson)
              .toList(growable: false),
    );
  }

  Future<void> load(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final requestToken = ++_loadRequestToken;
    final workspaceChanged = state.workspaceId != wsId;
    final cacheKey = _cacheKey(wsId);
    final cached = await CacheStore.instance.read<Map<String, dynamic>>(
      key: cacheKey,
      decode: _decodeCacheJson,
    );

    if (!forceRefresh && cached.hasValue) {
      final json = cached.data!;
      emit(
        state.copyWith(
          status: TaskPortfolioStatus.loaded,
          workspaceId: wsId,
          projects: ((json['projects'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(TaskProjectSummary.fromJson)
              .toList(growable: false),
          initiatives:
              ((json['initiatives'] as List<dynamic>?) ?? const <dynamic>[])
                  .whereType<Map<String, dynamic>>()
                  .map(TaskInitiativeSummary.fromJson)
                  .toList(growable: false),
          clearError: true,
        ),
      );
      if (cached.isFresh) {
        return;
      }
    }

    emit(
      state.copyWith(
        status: TaskPortfolioStatus.loading,
        workspaceId: wsId,
        projects: workspaceChanged ? const [] : state.projects,
        initiatives: workspaceChanged ? const [] : state.initiatives,
        isMutating: !workspaceChanged && state.isMutating,
        clearError: true,
      ),
    );

    try {
      final projectsFuture = _taskRepository.getTaskProjects(wsId);
      final initiativesFuture = _taskRepository.getTaskInitiatives(wsId);
      final projects = await projectsFuture;
      final initiatives = await initiativesFuture;

      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskPortfolioStatus.loaded,
          workspaceId: wsId,
          projects: projects,
          initiatives: initiatives,
          clearError: true,
        ),
      );
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: {
          'projects': projects
              .map((project) => project.toJson())
              .toList(growable: false),
          'initiatives': initiatives
              .map((initiative) => initiative.toJson())
              .toList(growable: false),
        },
        tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      );
    } on Exception catch (error) {
      if (requestToken != _loadRequestToken) return;

      emit(
        state.copyWith(
          status: TaskPortfolioStatus.error,
          workspaceId: wsId,
          error: error.toString(),
        ),
      );
    }
  }

  Future<void> createProject({
    required String wsId,
    required String name,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.createTaskProject(
        wsId: wsId,
        name: name,
        description: description,
      ),
    );
  }

  Future<void> updateProject({
    required String wsId,
    required String projectId,
    required String name,
    String? status,
    String? priority,
    String? healthStatus,
    String? description,
    String? leadId,
    DateTime? startDate,
    DateTime? endDate,
    bool? archived,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.updateTaskProject(
        wsId: wsId,
        projectId: projectId,
        name: name,
        description: description,
        status: status,
        priority: priority,
        healthStatus: healthStatus,
        leadId: leadId,
        startDate: startDate,
        endDate: endDate,
        archived: archived,
      ),
    );
  }

  Future<void> deleteProject({
    required String wsId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.deleteTaskProject(wsId: wsId, projectId: projectId),
    );
  }

  Future<void> createInitiative({
    required String wsId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.createTaskInitiative(
        wsId: wsId,
        name: name,
        description: description,
        status: status,
      ),
    );
  }

  Future<void> updateInitiative({
    required String wsId,
    required String initiativeId,
    required String name,
    required String status,
    String? description,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.updateTaskInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        name: name,
        description: description,
        status: status,
      ),
    );
  }

  Future<void> deleteInitiative({
    required String wsId,
    required String initiativeId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.deleteTaskInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
      ),
    );
  }

  Future<void> linkProjectToInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.linkProjectToInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        projectId: projectId,
      ),
    );
  }

  Future<void> unlinkProjectFromInitiative({
    required String wsId,
    required String initiativeId,
    required String projectId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.unlinkProjectFromInitiative(
        wsId: wsId,
        initiativeId: initiativeId,
        projectId: projectId,
      ),
    );
  }

  Future<void> linkTaskToProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.linkTaskToProject(
        wsId: wsId,
        projectId: projectId,
        taskId: taskId,
      ),
    );
  }

  Future<void> unlinkTaskFromProject({
    required String wsId,
    required String projectId,
    required String taskId,
  }) async {
    await _runMutation(
      wsId,
      () => _taskRepository.unlinkTaskFromProject(
        wsId: wsId,
        projectId: projectId,
        taskId: taskId,
      ),
    );
  }

  Future<void> _runMutation(
    String wsId,
    Future<void> Function() action,
  ) async {
    emit(state.copyWith(isMutating: true, clearError: true));
    try {
      await action();
      if (state.workspaceId != wsId) {
        return;
      }
      emit(state.copyWith(isMutating: false, clearError: true));
      await load(wsId, forceRefresh: true);
    } catch (_) {
      if (state.workspaceId == wsId) {
        emit(state.copyWith(isMutating: false));
      }
      rethrow;
    }
  }
}
