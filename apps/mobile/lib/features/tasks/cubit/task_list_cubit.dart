import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/data/task_broadcast_client.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';

part 'task_list_mutations.dart';
part 'task_list_state.dart';

const _sentinel = Object();

class TaskListCubit extends Cubit<TaskListState> {
  TaskListCubit({
    required TaskRepository taskRepository,
    TaskBroadcastClient? taskBroadcastClient,
    TaskListState? initialState,
    DateTime Function()? clock,
  }) : _repo = taskRepository,
       _clock = clock ?? DateTime.now,
       _cacheUserId = currentCacheUserId(),
       _taskBroadcastClient = TaskBroadcastOwner(taskBroadcastClient),
       super(initialState ?? const TaskListState()) {
    OfflineMutationQueue.instance.syncRevision.addListener(_onSynchronized);
  }

  void _onSynchronized() {
    if (!isClosed && _wsId != null) {
      unawaited(reload());
    }
  }

  final TaskRepository _repo;
  final DateTime Function() _clock;
  final TaskBroadcastClient _taskBroadcastClient;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'tasks:list';

  String? _wsId;
  String? _cacheUserId;
  String? _userId;
  bool _isPersonal = false;
  int _requestVersion = 0;
  final Set<String> _writingTaskIds = {};
  TaskBroadcastSubscription? _userBroadcastSubscription;
  String? _subscribedRealtimeUserId;
  Timer? _realtimeReloadTimer;
  final Set<String> _seenRealtimeEventIds = <String>{};

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid task list cache payload.');
    }

    return Map<String, dynamic>.from(json);
  }

  static CacheKey _cacheKey({
    required String wsId,
    required bool isPersonal,
    String? userId,
  }) {
    return CacheKey(
      namespace: 'tasks.list',
      userId: userId ?? currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'isPersonal': isPersonal.toString()},
    );
  }

  static CacheKey offlineSummaryKey(
    String wsId, {
    required bool isPersonal,
    String? userId,
  }) => _cacheKey(wsId: wsId, isPersonal: isPersonal, userId: userId);

  static Future<void> prewarm({
    required TaskRepository taskRepository,
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async {
    final actor = currentCacheUserId();
    await CacheStore.instance.prefetch<UserTasksPage>(
      key: _cacheKey(wsId: wsId, isPersonal: isPersonal),
      checkScope: () {
        if (actor != currentCacheUserId()) {
          throw StateError('Task account changed.');
        }
      },
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
    String? userId,
  }) {
    final cached = CacheStore.instance.peek<UserTasksPage>(
      key: _cacheKey(wsId: wsId, isPersonal: isPersonal, userId: userId),
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

  /// [retainError] keeps a visible error state and its message while the
  /// pull-to-refresh gesture reloads; an explicit Retry leaves it false so
  /// the page re-enters its loading state.
  Future<void> loadTasks({
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
    bool retainError = false,
    String? userId,
  }) async {
    if (_writingTaskIds.isNotEmpty && _wsId == wsId && _userId == userId) {
      return;
    }
    final cacheUserId = currentCacheUserId();
    final actor = userId?.trim();
    final sameTarget =
        _cacheUserId == cacheUserId &&
        _userId == actor &&
        _wsId == wsId &&
        _isPersonal == isPersonal;
    final preserveData = sameTarget && state.hasLoadedOnce;
    final keepError =
        retainError &&
        forceRefresh &&
        sameTarget &&
        state.status == TaskListStatus.error;
    if (_cacheUserId != cacheUserId || (_wsId != null && !sameTarget)) {
      emit(const TaskListState());
    }
    _cacheUserId = cacheUserId;
    _wsId = wsId;
    _userId = actor;
    _ensureUserRealtimeSubscription(actor);
    _isPersonal = isPersonal;
    final requestVersion = ++_requestVersion;
    final cacheKey = _cacheKey(
      wsId: wsId,
      isPersonal: isPersonal,
      userId: actor,
    );
    final cached = await CacheStore.instance.read<UserTasksPage>(
      key: cacheKey,
      decode: (json) => UserTasksPage.fromJson(_decodeCacheJson(json)),
    );
    if (isClosed ||
        requestVersion != _requestVersion ||
        cacheUserId != currentCacheUserId()) {
      return;
    }
    final cachedPage = cached.data;
    final hasCachedValue = cached.hasValue && cachedPage != null;

    if (hasCachedValue && !preserveData) {
      final page = cachedPage;
      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
          isFromCache: true,
          isRefreshing: true,
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
    }

    final shouldServeVisibleData = preserveData || hasCachedValue;

    if (shouldServeVisibleData) {
      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
          isFromCache: state.isFromCache,
          isRefreshing: true,
          lastUpdatedAt: state.lastUpdatedAt,
          isLoadingMoreCompleted: false,
          clearError: true,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: keepError ? TaskListStatus.error : TaskListStatus.loading,
          hasLoadedOnce: false,
          isFromCache: false,
          isRefreshing: keepError,
          lastUpdatedAt: cached.fetchedAt,
          overdueTasks: const [],
          todayTasks: const [],
          upcomingTasks: const [],
          completedTasks: const [],
          totalActiveTasks: 0,
          totalCompletedTasks: 0,
          hasMoreCompleted: false,
          completedPage: 0,
          isLoadingMoreCompleted: false,
          clearError: !keepError,
        ),
      );
    }

    try {
      final page = await CacheStore.awaitRevalidation(() {
        Future<UserTasksPage> read() =>
            _repo.getMyTasks(wsId: wsId, isPersonal: isPersonal);
        return actor == null ? read() : ApiClient.runForUser(actor, read);
      });
      if (isClosed ||
          requestVersion != _requestVersion ||
          cacheUserId != currentCacheUserId()) {
        return;
      }
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: page.toJson(),
        tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
      );
      if (isClosed ||
          requestVersion != _requestVersion ||
          cacheUserId != currentCacheUserId()) {
        return;
      }

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
      if (isClosed ||
          requestVersion != _requestVersion ||
          cacheUserId != currentCacheUserId()) {
        return;
      }
      if (shouldServeVisibleData) {
        emit(
          state.copyWith(
            status: TaskListStatus.loaded,
            isRefreshing: false,
            error: e.toString(),
          ),
        );
        return;
      }
      emit(state.copyWith(status: TaskListStatus.error, error: e.toString()));
    }
  }

  Future<void> reload() async {
    if (_writingTaskIds.isNotEmpty) return;
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    await loadTasks(wsId: wsId, isPersonal: _isPersonal, userId: _userId);
  }

  Future<void> loadMoreCompleted() async {
    final wsId = _wsId;
    if (wsId == null ||
        isClosed ||
        _writingTaskIds.isNotEmpty ||
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
      if (isClosed || requestVersion != _requestVersion) {
        return;
      }

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
      if (isClosed || requestVersion != _requestVersion) {
        return;
      }
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
    if (wsId == null) {
      return;
    }
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
      key: _cacheKey(wsId: wsId, isPersonal: _isPersonal, userId: _userId),
      policy: _cachePolicy,
      payload: page.toJson(),
      tags: [_cacheTag, 'workspace:$wsId', 'module:tasks'],
    );
  }

  void _ensureUserRealtimeSubscription(String? userId) {
    if (_subscribedRealtimeUserId == userId) {
      return;
    }

    final previousSubscription = _userBroadcastSubscription;
    _userBroadcastSubscription = null;
    _subscribedRealtimeUserId = userId;
    unawaited(previousSubscription?.cancel());
    _seenRealtimeEventIds.clear();
    _realtimeReloadTimer?.cancel();
    if (userId == null || userId.isEmpty) return;

    _userBroadcastSubscription = _taskBroadcastClient.subscribeToUser(
      userId: userId,
      onEvent: _handleUserRealtimeEvent,
    );
  }

  bool _rememberRealtimeEvent(TaskBroadcastEvent event) {
    final eventId = event.eventId;
    if (eventId == null || eventId.isEmpty) {
      return false;
    }
    if (_seenRealtimeEventIds.contains(eventId)) {
      return true;
    }

    _seenRealtimeEventIds.add(eventId);
    while (_seenRealtimeEventIds.length > 500) {
      _seenRealtimeEventIds.remove(_seenRealtimeEventIds.first);
    }
    return false;
  }

  void _handleUserRealtimeEvent(TaskBroadcastEvent event) {
    if (isClosed ||
        _writingTaskIds.contains(event.taskId) ||
        _rememberRealtimeEvent(event)) {
      return;
    }

    switch (event.event) {
      case 'task:upsert':
        final task = _userTaskFromBroadcast(event);
        if (task != null) {
          _patchVisibleTask(task);
        }
        _scheduleRealtimeReload();
      case 'task:delete':
        final taskId = event.taskId;
        if (taskId != null) {
          _removeVisibleTask(taskId);
        }
        _scheduleRealtimeReload();
      case 'task:relations-changed':
      case 'task:deps-changed':
      case 'list:upsert':
      case 'list:delete':
        _scheduleRealtimeReload();
    }
  }

  UserTask? _userTaskFromBroadcast(TaskBroadcastEvent event) {
    final taskJson = event.task;
    if (taskJson == null || taskJson['list'] == null) {
      return null;
    }

    try {
      return UserTask.fromJson(taskJson);
    } on Object {
      return null;
    }
  }

  void _patchVisibleTask(UserTask replacement) {
    List<UserTask> patch(List<UserTask> tasks) => tasks
        .map((task) => task.id == replacement.id ? replacement : task)
        .toList(growable: false);

    emit(
      state.copyWith(
        overdueTasks: patch(state.overdueTasks),
        todayTasks: patch(state.todayTasks),
        upcomingTasks: patch(state.upcomingTasks),
        completedTasks: patch(state.completedTasks),
      ),
    );
  }

  void _removeVisibleTask(String taskId) {
    List<UserTask> remove(List<UserTask> tasks) =>
        tasks.where((task) => task.id != taskId).toList(growable: false);

    emit(
      state.copyWith(
        overdueTasks: remove(state.overdueTasks),
        todayTasks: remove(state.todayTasks),
        upcomingTasks: remove(state.upcomingTasks),
        completedTasks: remove(state.completedTasks),
      ),
    );
  }

  void _scheduleRealtimeReload() {
    _realtimeReloadTimer?.cancel();
    _realtimeReloadTimer = Timer(const Duration(milliseconds: 250), () {
      unawaited(reload());
    });
  }

  void toggleSection(TaskListSection section) {
    emit(switch (section) {
      TaskListSection.overdue => state.copyWith(
        isOverdueCollapsed: !state.isOverdueCollapsed,
      ),
      TaskListSection.today => state.copyWith(
        isTodayCollapsed: !state.isTodayCollapsed,
      ),
      TaskListSection.upcoming => state.copyWith(
        isUpcomingCollapsed: !state.isUpcomingCollapsed,
      ),
      TaskListSection.noDate => state.copyWith(
        isNoDateCollapsed: !state.isNoDateCollapsed,
      ),
      TaskListSection.completed => state.copyWith(
        isCompletedCollapsed: !state.isCompletedCollapsed,
      ),
    });
  }

  Future<bool> _writeMyTask({
    required Future<UserTask> Function() write,
    required bool completed,
    String? taskId,
    String? zone,
  }) async {
    final actor = _userId;
    final scope = (_wsId, actor, _cacheUserId);
    final hadLoadedTasks = state.hasLoadedOnce;
    final lock = taskId ?? 'my-task-create';
    if (isClosed || actor == null || !_writingTaskIds.add(lock)) return false;
    _requestVersion++;
    emit(state.copyWith(isRefreshing: false, isLoadingMoreCompleted: false));
    try {
      final task = await ApiClient.runForUser(actor, write);
      if (isClosed || scope != (_wsId, _userId, currentCacheUserId())) {
        return false;
      }
      final wasCompleted = state.completedTasks.any(
        (item) => item.id == task.id,
      );
      final wasActive = [
        ...state.overdueTasks,
        ...state.todayTasks,
        ...state.upcomingTasks,
      ].any((item) => item.id == task.id);
      final section = completed
          ? TaskListSection.completed
          : myTaskDueSection(task.endDate, now: _clock(), zone: zone);
      final bucket = section == TaskListSection.noDate
          ? TaskListSection.upcoming
          : section;
      List<UserTask> update(
        List<UserTask> tasks,
        TaskListSection destination,
      ) => [
        if (bucket == destination) task,
        for (final item in tasks)
          if (item.id != task.id) item,
      ];
      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
          overdueTasks: update(state.overdueTasks, TaskListSection.overdue),
          todayTasks: update(state.todayTasks, TaskListSection.today),
          upcomingTasks: update(state.upcomingTasks, TaskListSection.upcoming),
          completedTasks: update(
            state.completedTasks,
            TaskListSection.completed,
          ),
          totalActiveTasks:
              (state.totalActiveTasks +
                      (completed ? 0 : 1) -
                      (wasActive ? 1 : 0))
                  .clamp(0, 1 << 30),
          totalCompletedTasks:
              (state.totalCompletedTasks +
                      (completed ? 1 : 0) -
                      (wasCompleted ? 1 : 0))
                  .clamp(0, 1 << 30),
        ),
      );
      await _persistCurrentState();
      return true;
    } finally {
      _writingTaskIds.remove(lock);
      if (!hadLoadedTasks &&
          !isClosed &&
          scope == (_wsId, _userId, currentCacheUserId())) {
        unawaited(reload());
      }
    }
  }

  @override
  Future<void> close() async {
    _requestVersion++;
    _wsId = null;
    _userId = null;
    OfflineMutationQueue.instance.syncRevision.removeListener(_onSynchronized);
    _realtimeReloadTimer?.cancel();
    _seenRealtimeEventIds.clear();
    final subscription = _userBroadcastSubscription;
    _userBroadcastSubscription = null;
    _subscribedRealtimeUserId = null;
    await closeOwnedTaskBroadcastClient(_taskBroadcastClient, subscription);
    return await super.close();
  }
}
