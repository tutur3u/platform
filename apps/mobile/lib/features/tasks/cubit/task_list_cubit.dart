import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/task.dart';
import 'package:mobile/data/repositories/task_repository.dart';

part 'task_list_state.dart';

class TaskListCubit extends Cubit<TaskListState> {
  TaskListCubit({required TaskRepository taskRepository})
    : _repo = taskRepository,
      super(const TaskListState());

  final TaskRepository _repo;

  Future<void> loadTasks(String wsId) async {
    emit(state.copyWith(status: TaskListStatus.loading));

    try {
      final tasks = await _repo.getTasks(wsId);
      emit(state.copyWith(status: TaskListStatus.loaded, tasks: tasks));
    } on Exception catch (e) {
      emit(
        state.copyWith(status: TaskListStatus.error, error: e.toString()),
      );
    }
  }

  Future<void> toggleTaskCompletion(Task task) async {
    final updated = task.copyWith(completed: !(task.completed ?? false));
    final previousTasks = state.tasks;

    // Optimistic update
    final optimisticTasks = previousTasks
        .map((t) => t.id == task.id ? updated : t)
        .toList();
    emit(state.copyWith(tasks: optimisticTasks));

    try {
      await _repo.updateTask(task.id, {'completed': updated.completed});
    } on Exception catch (e) {
      // Rollback on failure
      emit(
        state.copyWith(
          tasks: previousTasks,
          error: e.toString(),
        ),
      );
    }
  }
}
