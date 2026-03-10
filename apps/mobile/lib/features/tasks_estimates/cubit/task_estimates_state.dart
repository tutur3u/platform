part of 'task_estimates_cubit.dart';

const _taskEstimatesSentinel = Object();

enum TaskEstimatesStatus { initial, loading, loaded, updating, error }

class TaskEstimatesState extends Equatable {
  const TaskEstimatesState({
    this.status = TaskEstimatesStatus.initial,
    this.boards = const <TaskEstimateBoard>[],
    this.error,
  });

  final TaskEstimatesStatus status;
  final List<TaskEstimateBoard> boards;
  final String? error;

  TaskEstimatesState copyWith({
    TaskEstimatesStatus? status,
    List<TaskEstimateBoard>? boards,
    Object? error = _taskEstimatesSentinel,
  }) {
    return TaskEstimatesState(
      status: status ?? this.status,
      boards: boards ?? this.boards,
      error: error == _taskEstimatesSentinel ? this.error : error as String?,
    );
  }

  int get totalBoards => boards.length;

  int get configuredBoards =>
      boards.where((board) => board.estimationType != null).length;

  int get extendedBoards => boards
      .where(
        (board) => board.estimationType != null && board.extendedEstimation,
      )
      .length;

  @override
  List<Object?> get props => [status, boards, error];
}
