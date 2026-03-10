import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/user_task.dart';

class UserTasksPage extends Equatable {
  const UserTasksPage({
    required this.overdue,
    required this.today,
    required this.upcoming,
    required this.completed,
    required this.totalActiveTasks,
    required this.totalCompletedTasks,
    required this.hasMoreCompleted,
    required this.completedPage,
  });

  factory UserTasksPage.fromJson(Map<String, dynamic> json) => UserTasksPage(
    overdue: _parseTasks(json['overdue']),
    today: _parseTasks(json['today']),
    upcoming: _parseTasks(json['upcoming']),
    completed: _parseTasks(json['completed']),
    totalActiveTasks: (json['totalActiveTasks'] as num?)?.toInt() ?? 0,
    totalCompletedTasks: (json['totalCompletedTasks'] as num?)?.toInt() ?? 0,
    hasMoreCompleted: json['hasMoreCompleted'] as bool? ?? false,
    completedPage: (json['completedPage'] as num?)?.toInt() ?? 0,
  );

  final List<UserTask> overdue;
  final List<UserTask> today;
  final List<UserTask> upcoming;
  final List<UserTask> completed;
  final int totalActiveTasks;
  final int totalCompletedTasks;
  final bool hasMoreCompleted;
  final int completedPage;

  static List<UserTask> _parseTasks(dynamic value) {
    if (value is! List) return const <UserTask>[];
    return value
        .whereType<Map<String, dynamic>>()
        .map(UserTask.fromJson)
        .toList(growable: false);
  }

  @override
  List<Object?> get props => [
    overdue,
    today,
    upcoming,
    completed,
    totalActiveTasks,
    totalCompletedTasks,
    hasMoreCompleted,
    completedPage,
  ];
}
