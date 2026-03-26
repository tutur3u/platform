import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_list_state.dart';

const _sentinel = Object();

class TaskListCubit extends Cubit<TaskListState> {
  TaskListCubit({
    required TaskRepository taskRepository,
    TaskListState? initialState,
  }) : _repo = taskRepository,
       super(initialState ?? const TaskListState());

  final TaskRepository _repo;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'tasks:list';

  String? _wsId;
  bool _isPersonal = false;
  int _requestVersion = 0;

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task list cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey({
    required String wsId,
    required bool isPersonal,
  }) {
    return CacheKey(
      namespace: 'tasks.list',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'isPersonal': isPersonal.toString()},
    );
  }

  static Future<void> prewarm({
    required TaskRepository taskRepository,
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async {
    await CacheStore.instance.prefetch<UserTasksPage>(
      key: _cacheKey(wsId: wsId, isPersonal: isPersonal),
      policy: _cachePolicy,
      decode: (json) => UserTasksPage.fromJson(_decodeCacheJson(json)),
      fetch: () async => (await taskRepository.getMyTasks(
        wsId: wsId,
        isPersonal: isPersonal,
      )).toJson(),
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
    );
  }

  static TaskListState? seedStateFor({
    required String wsId,
    required bool isPersonal,
  }) {
    final cached = CacheStore.instance.peek<UserTasksPage>(
      key: _cacheKey(wsId: wsId, isPersonal: isPersonal),
      decode: (json) => UserTasksPage.fromJson(_decodeCacheJson(json)),
    );
    final page = cached.data;
    if (!cached.hasValue || page == null) {
      return null;
    }

    return TaskListState(
      status: TaskListStatus.loaded,
      hasLoadedOnce: true,
      isFromCache: true,
      lastUpdatedAt: cached.fetchedAt,
      overdueTasks: page.overdue,
      todayTasks: page.today,
      upcomingTasks: page.upcoming,
      completedTasks: page.completed,
      totalActiveTasks: page.totalActiveTasks,
      totalCompletedTasks: page.totalCompletedTasks,
      hasMoreCompleted: page.hasMoreCompleted,
      completedPage: page.completedPage,
    );
  }

  Future<void> loadTasks({
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async {
    final preserveData =
        _wsId == wsId && _isPersonal == isPersonal && state.hasLoadedOnce;
    _wsId = wsId;
    _isPersonal = isPersonal;
    final requestVersion = ++_requestVersion;
    final cacheKey = _cacheKey(wsId: wsId, isPersonal: isPersonal);
    final cached = await CacheStore.instance.read<UserTasksPage>(
      key: cacheKey,
      decode: (json) => UserTasksPage.fromJson(_decodeCacheJson(json)),
    );

    if (cached.hasValue && cached.data != null) {
      final page = cached.data!;
      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
          isFromCache: true,
          isRefreshing: forceRefresh || !cached.isFresh,
          lastUpdatedAt: cached.fetchedAt,
          overdueTasks: page.overdue,
          todayTasks: page.today,
          upcomingTasks: page.upcoming,
          completedTasks: page.completed,
          totalActiveTasks: page.totalActiveTasks,
          totalCompletedTasks: page.totalCompletedTasks,
          hasMoreCompleted: page.hasMoreCompleted,
          completedPage: page.completedPage,
          isLoadingMoreCompleted: false,
          clearError: true,
        ),
      );
      if (!forceRefresh && cached.isFresh) {
        return;
      }
    }

    emit(
      state.copyWith(
        status: TaskListStatus.loading,
        hasLoadedOnce: preserveData && state.hasLoadedOnce,
        isFromCache: cached.hasValue,
        isRefreshing: cached.hasValue,
        lastUpdatedAt: cached.fetchedAt,
        overdueTasks: preserveData ? null : const [],
        todayTasks: preserveData ? null : const [],
        upcomingTasks: preserveData ? null : const [],
        completedTasks: preserveData ? null : const [],
        totalActiveTasks: preserveData ? null : 0,
        totalCompletedTasks: preserveData ? null : 0,
        hasMoreCompleted: preserveData ? null : false,
        completedPage: preserveData ? null : 0,
        isLoadingMoreCompleted: false,
        clearError: true,
      ),
    );

    try {
      final page = await _repo.getMyTasks(wsId: wsId, isPersonal: isPersonal);
      if (requestVersion != _requestVersion) return;
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: page.toJson(),
        tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      );

      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: DateTime.now(),
          overdueTasks: page.overdue,
          todayTasks: page.today,
          upcomingTasks: page.upcoming,
          completedTasks: page.completed,
          totalActiveTasks: page.totalActiveTasks,
          totalCompletedTasks: page.totalCompletedTasks,
          hasMoreCompleted: page.hasMoreCompleted,
          completedPage: page.completedPage,
          isLoadingMoreCompleted: false,
          clearError: true,
        ),
      );
    } on Exception catch (e) {
      if (requestVersion != _requestVersion) return;
      if (cached.hasValue) {
        emit(
          state.copyWith(
            status: TaskListStatus.loaded,
            isRefreshing: false,
            error: e.toString(),
          ),
        );
        return;
      }
      emit(
        state.copyWith(
          status: TaskListStatus.error,
          error: e.toString(),
        ),
      );
    }
  }

  Future<void> reload() async {
    final wsId = _wsId;
    if (wsId == null) return;
    await loadTasks(wsId: wsId, isPersonal: _isPersonal);
  }

  Future<void> loadMoreCompleted() async {
    final wsId = _wsId;
    if (wsId == null ||
        state.status == TaskListStatus.loading ||
        state.isLoadingMoreCompleted ||
        !state.hasMoreCompleted) {
      return;
    }

    final requestVersion = _requestVersion;
    emit(state.copyWith(isLoadingMoreCompleted: true, clearError: true));

    try {
      final page = await _repo.getMyTasks(
        wsId: wsId,
        isPersonal: _isPersonal,
        completedPage: state.completedPage + 1,
      );
      if (requestVersion != _requestVersion) return;

      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          isRefreshing: false,
          completedTasks: [...state.completedTasks, ...page.completed],
          totalCompletedTasks: page.totalCompletedTasks,
          hasMoreCompleted: page.hasMoreCompleted,
          completedPage: page.completedPage,
          isLoadingMoreCompleted: false,
          clearError: true,
        ),
      );
      await _persistCurrentState();
    } on Exception catch (e) {
      if (requestVersion != _requestVersion) return;
      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          isLoadingMoreCompleted: false,
          error: e.toString(),
        ),
      );
    }
  }

  Future<void> _persistCurrentState() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final page = UserTasksPage(
      overdue: state.overdueTasks,
      today: state.todayTasks,
      upcoming: state.upcomingTasks,
      completed: state.completedTasks,
      totalActiveTasks: state.totalActiveTasks,
      totalCompletedTasks: state.totalCompletedTasks,
      hasMoreCompleted: state.hasMoreCompleted,
      completedPage: state.completedPage,
    );
    await CacheStore.instance.write(
      key: _cacheKey(wsId: wsId, isPersonal: _isPersonal),
      policy: _cachePolicy,
      payload: page.toJson(),
      tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
    );
  }

  void toggleSection(TaskListSection section) {
    emit(
      switch (section) {
        TaskListSection.overdue => state.copyWith(
          isOverdueCollapsed: !state.isOverdueCollapsed,
        ),
        TaskListSection.today => state.copyWith(
          isTodayCollapsed: !state.isTodayCollapsed,
        ),
        TaskListSection.upcoming => state.copyWith(
          isUpcomingCollapsed: !state.isUpcomingCollapsed,
        ),
        TaskListSection.completed => state.copyWith(
          isCompletedCollapsed: !state.isCompletedCollapsed,
        ),
      },
    );
  }
}
