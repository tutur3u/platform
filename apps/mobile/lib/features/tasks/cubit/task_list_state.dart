part of 'task_list_cubit.dart';

enum TaskListStatus { initial, loading, loaded, error }

enum TaskListSection { overdue, today, upcoming, completed }

class TaskListState extends Equatable {
  const TaskListState({
    this.status = TaskListStatus.initial,
    this.overdueTasks = const [],
    this.todayTasks = const [],
    this.upcomingTasks = const [],
    this.completedTasks = const [],
    this.totalActiveTasks = 0,
    this.totalCompletedTasks = 0,
    this.hasMoreCompleted = false,
    this.completedPage = 0,
    this.isLoadingMoreCompleted = false,
    this.isOverdueCollapsed = false,
    this.isTodayCollapsed = false,
    this.isUpcomingCollapsed = false,
    this.isCompletedCollapsed = true,
    this.error,
  });

  final TaskListStatus status;
  final List<UserTask> overdueTasks;
  final List<UserTask> todayTasks;
  final List<UserTask> upcomingTasks;
  final List<UserTask> completedTasks;
  final int totalActiveTasks;
  final int totalCompletedTasks;
  final bool hasMoreCompleted;
  final int completedPage;
  final bool isLoadingMoreCompleted;
  final bool isOverdueCollapsed;
  final bool isTodayCollapsed;
  final bool isUpcomingCollapsed;
  final bool isCompletedCollapsed;
  final String? error;

  TaskListState copyWith({
    TaskListStatus? status,
    List<UserTask>? overdueTasks,
    List<UserTask>? todayTasks,
    List<UserTask>? upcomingTasks,
    List<UserTask>? completedTasks,
    int? totalActiveTasks,
    int? totalCompletedTasks,
    bool? hasMoreCompleted,
    int? completedPage,
    bool? isLoadingMoreCompleted,
    bool? isOverdueCollapsed,
    bool? isTodayCollapsed,
    bool? isUpcomingCollapsed,
    bool? isCompletedCollapsed,
    String? error,
    bool clearError = false,
  }) => TaskListState(
    status: status ?? this.status,
    overdueTasks: overdueTasks ?? this.overdueTasks,
    todayTasks: todayTasks ?? this.todayTasks,
    upcomingTasks: upcomingTasks ?? this.upcomingTasks,
    completedTasks: completedTasks ?? this.completedTasks,
    totalActiveTasks: totalActiveTasks ?? this.totalActiveTasks,
    totalCompletedTasks: totalCompletedTasks ?? this.totalCompletedTasks,
    hasMoreCompleted: hasMoreCompleted ?? this.hasMoreCompleted,
    completedPage: completedPage ?? this.completedPage,
    isLoadingMoreCompleted:
        isLoadingMoreCompleted ?? this.isLoadingMoreCompleted,
    isOverdueCollapsed: isOverdueCollapsed ?? this.isOverdueCollapsed,
    isTodayCollapsed: isTodayCollapsed ?? this.isTodayCollapsed,
    isUpcomingCollapsed: isUpcomingCollapsed ?? this.isUpcomingCollapsed,
    isCompletedCollapsed: isCompletedCollapsed ?? this.isCompletedCollapsed,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    overdueTasks,
    todayTasks,
    upcomingTasks,
    completedTasks,
    totalActiveTasks,
    totalCompletedTasks,
    hasMoreCompleted,
    completedPage,
    isLoadingMoreCompleted,
    isOverdueCollapsed,
    isTodayCollapsed,
    isUpcomingCollapsed,
    isCompletedCollapsed,
    error,
  ];
}
