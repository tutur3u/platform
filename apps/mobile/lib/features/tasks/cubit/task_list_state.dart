part of 'task_list_cubit.dart';

enum TaskListStatus { initial, loading, loaded, error }

class TaskListState extends Equatable {
  const TaskListState({
    this.status = TaskListStatus.initial,
    this.overdueTasks = const [],
    this.todayTasks = const [],
    this.upcomingTasks = const [],
    this.error,
  });

  final TaskListStatus status;
  final List<UserTask> overdueTasks;
  final List<UserTask> todayTasks;
  final List<UserTask> upcomingTasks;
  final String? error;

  int get totalActiveTasks =>
      overdueTasks.length + todayTasks.length + upcomingTasks.length;

  TaskListState copyWith({
    TaskListStatus? status,
    List<UserTask>? overdueTasks,
    List<UserTask>? todayTasks,
    List<UserTask>? upcomingTasks,
    String? error,
    bool clearError = false,
  }) => TaskListState(
    status: status ?? this.status,
    overdueTasks: overdueTasks ?? this.overdueTasks,
    todayTasks: todayTasks ?? this.todayTasks,
    upcomingTasks: upcomingTasks ?? this.upcomingTasks,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    overdueTasks,
    todayTasks,
    upcomingTasks,
    error,
  ];
}
