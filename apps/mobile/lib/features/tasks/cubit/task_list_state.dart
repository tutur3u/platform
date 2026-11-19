part of 'task_list_cubit.dart';

enum TaskListStatus { initial, loading, loaded, error }

enum TaskListSection { overdue, today, upcoming, noDate, completed }

TaskListSection myTaskDueSection(
  DateTime? due, {
  required DateTime now,
  String? zone,
}) {
  if (due == null) return TaskListSection.noDate;
  final comparison = taskDay(due, zone).compareTo(taskDay(now, zone));
  if (comparison < 0) return TaskListSection.overdue;
  if (comparison == 0) return TaskListSection.today;
  return TaskListSection.upcoming;
}

class TaskListState extends Equatable {
  const TaskListState({
    this.status = TaskListStatus.initial,
    this.hasLoadedOnce = false,
    this.isFromCache = false,
    this.isRefreshing = false,
    this.lastUpdatedAt,
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
    this.isNoDateCollapsed = false,
    this.isCompletedCollapsed = true,
    this.error,
  });

  final TaskListStatus status;
  final bool hasLoadedOnce;
  final bool isFromCache;
  final bool isRefreshing;
  final DateTime? lastUpdatedAt;
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
  final bool isNoDateCollapsed;
  final bool isCompletedCollapsed;
  final String? error;

  TaskListState copyWith({
    TaskListStatus? status,
    bool? hasLoadedOnce,
    bool? isFromCache,
    bool? isRefreshing,
    Object? lastUpdatedAt = _sentinel,
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
    bool? isNoDateCollapsed,
    bool? isCompletedCollapsed,
    String? error,
    bool clearError = false,
  }) => TaskListState(
    status: status ?? this.status,
    hasLoadedOnce: hasLoadedOnce ?? this.hasLoadedOnce,
    isFromCache: isFromCache ?? this.isFromCache,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    lastUpdatedAt: lastUpdatedAt == _sentinel
        ? this.lastUpdatedAt
        : lastUpdatedAt as DateTime?,
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
    isNoDateCollapsed: isNoDateCollapsed ?? this.isNoDateCollapsed,
    isCompletedCollapsed: isCompletedCollapsed ?? this.isCompletedCollapsed,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    hasLoadedOnce,
    isFromCache,
    isRefreshing,
    lastUpdatedAt,
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
    isNoDateCollapsed,
    isCompletedCollapsed,
    error,
  ];
}
