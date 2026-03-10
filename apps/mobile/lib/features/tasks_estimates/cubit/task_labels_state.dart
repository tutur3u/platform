part of 'task_labels_cubit.dart';

const _taskLabelsSentinel = Object();

enum TaskLabelsStatus { initial, loading, loaded, saving, error }

class TaskLabelsState extends Equatable {
  const TaskLabelsState({
    this.status = TaskLabelsStatus.initial,
    this.labels = const <TaskLabel>[],
    this.error,
  });

  final TaskLabelsStatus status;
  final List<TaskLabel> labels;
  final String? error;

  TaskLabelsState copyWith({
    TaskLabelsStatus? status,
    List<TaskLabel>? labels,
    Object? error = _taskLabelsSentinel,
  }) {
    return TaskLabelsState(
      status: status ?? this.status,
      labels: labels ?? this.labels,
      error: error == _taskLabelsSentinel ? this.error : error as String?,
    );
  }

  @override
  List<Object?> get props => [status, labels, error];
}
