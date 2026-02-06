part of 'task_list_cubit.dart';

const _sentinel = Object();

enum TaskListStatus { initial, loading, loaded, error }

class TaskListState extends Equatable {
  const TaskListState({
    this.status = TaskListStatus.initial,
    this.tasks = const [],
    this.error,
  });

  final TaskListStatus status;
  final List<Task> tasks;
  final String? error;

  TaskListState copyWith({
    TaskListStatus? status,
    List<Task>? tasks,
    Object? error = _sentinel,
  }) => TaskListState(
    status: status ?? this.status,
    tasks: tasks ?? this.tasks,
    error: error == _sentinel ? this.error : error as String?,
  );

  @override
  List<Object?> get props => [status, tasks, error];
}
