part of 'task_portfolio_cubit.dart';

enum TaskPortfolioStatus { initial, loading, loaded, error }

class TaskPortfolioState extends Equatable {
  const TaskPortfolioState({
    this.status = TaskPortfolioStatus.initial,
    this.workspaceId,
    this.projects = const [],
    this.initiatives = const [],
    this.isMutating = false,
    this.error,
  });

  final TaskPortfolioStatus status;
  final String? workspaceId;
  final List<TaskProjectSummary> projects;
  final List<TaskInitiativeSummary> initiatives;
  final bool isMutating;
  final String? error;

  TaskPortfolioState copyWith({
    TaskPortfolioStatus? status,
    String? workspaceId,
    List<TaskProjectSummary>? projects,
    List<TaskInitiativeSummary>? initiatives,
    bool? isMutating,
    String? error,
    bool clearError = false,
  }) {
    return TaskPortfolioState(
      status: status ?? this.status,
      workspaceId: workspaceId ?? this.workspaceId,
      projects: projects ?? this.projects,
      initiatives: initiatives ?? this.initiatives,
      isMutating: isMutating ?? this.isMutating,
      error: clearError ? null : error ?? this.error,
    );
  }

  @override
  List<Object?> get props => [
    status,
    workspaceId,
    projects,
    initiatives,
    isMutating,
    error,
  ];
}
