import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_list_state.dart';

class TaskListCubit extends Cubit<TaskListState> {
  TaskListCubit({required TaskRepository taskRepository})
    : _repo = taskRepository,
      super(const TaskListState());

  final TaskRepository _repo;

  String? _wsId;
  bool _isPersonal = false;
  int _requestVersion = 0;

  Future<void> loadTasks({
    required String wsId,
    required bool isPersonal,
  }) async {
    final preserveData =
        _wsId == wsId && _isPersonal == isPersonal && state.hasLoadedOnce;
    _wsId = wsId;
    _isPersonal = isPersonal;
    final requestVersion = ++_requestVersion;

    emit(
      state.copyWith(
        status: TaskListStatus.loading,
        hasLoadedOnce: preserveData && state.hasLoadedOnce,
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

      emit(
        state.copyWith(
          status: TaskListStatus.loaded,
          hasLoadedOnce: true,
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
          completedTasks: [...state.completedTasks, ...page.completed],
          totalCompletedTasks: page.totalCompletedTasks,
          hasMoreCompleted: page.hasMoreCompleted,
          completedPage: page.completedPage,
          isLoadingMoreCompleted: false,
          clearError: true,
        ),
      );
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
