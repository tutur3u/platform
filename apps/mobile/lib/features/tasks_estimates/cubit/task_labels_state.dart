part of 'task_labels_cubit.dart';

const _taskLabelsSentinel = Object();
const _taskLabelsWsIdSentinel = Object();
const _taskLabelsRequestTokenSentinel = Object();

enum TaskLabelsStatus { initial, loading, loaded, saving, error }

class TaskLabelsState extends Equatable {
  const TaskLabelsState({
    this.status = TaskLabelsStatus.initial,
    this.labels = const <TaskLabel>[],
    this.error,
    this.wsId,
    this.requestToken,
  });

  final TaskLabelsStatus status;
  final List<TaskLabel> labels;
  final String? error;
  final String? wsId;
  final int? requestToken;

  TaskLabelsState copyWith({
    TaskLabelsStatus? status,
    List<TaskLabel>? labels,
    Object? error = _taskLabelsSentinel,
    Object? wsId = _taskLabelsWsIdSentinel,
    Object? requestToken = _taskLabelsRequestTokenSentinel,
  }) {
    return TaskLabelsState(
      status: status ?? this.status,
      labels: labels ?? this.labels,
      error: error == _taskLabelsSentinel ? this.error : error as String?,
      wsId: wsId == _taskLabelsWsIdSentinel ? this.wsId : wsId as String?,
      requestToken: requestToken == _taskLabelsRequestTokenSentinel
          ? this.requestToken
          : requestToken as int?,
    );
  }

  @override
  List<Object?> get props => [status, labels, error, wsId, requestToken];
}
