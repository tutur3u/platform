import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';

/// Due-date buckets for the board list view.
enum TaskListDateBucket { overdue, today, upcoming, noDate }

/// One section of tasks in [bucket] order.
class TaskListDateGroup {
  const TaskListDateGroup({required this.bucket, required this.tasks});

  final TaskListDateBucket bucket;
  final List<TaskBoardTask> tasks;
}

bool taskListTaskIsOpen(TaskBoardTask task, TaskBoardList? list) {
  if (task.closedAt != null || task.completed == true) return false;
  if (list?.completesWork ?? false) return false;
  return true;
}

/// Groups [tasks] into overdue, today, upcoming, and no-date sections.
///
/// Open tasks with a due date land in overdue, today, or upcoming. Tasks
/// without both start and due dates land in no-date. Completed work and tasks
/// on lists that suppress deadlines still appear under upcoming when dated.
List<TaskListDateGroup> buildTaskListDateGroups({
  required List<TaskBoardTask> tasks,
  required List<TaskBoardList> lists,
  required DateTime now,
  String? zone,
}) {
  if (tasks.isEmpty) return const [];

  final listsById = {for (final list in lists) list.id: list};
  final buckets = <TaskListDateBucket, List<TaskBoardTask>>{
    for (final bucket in TaskListDateBucket.values) bucket: [],
  };

  final today = taskDay(now, zone);

  for (final task in tasks) {
    final list = listsById[task.listId];
    final start = task.startDate;
    final end = task.endDate;

    if (start == null && end == null) {
      buckets[TaskListDateBucket.noDate]!.add(task);
      continue;
    }

    final open = taskListTaskIsOpen(task, list);
    final suppressesDeadlines = list?.suppressesDeadlines ?? false;
    final dueDay = end != null ? taskDay(end, zone) : null;

    if (open &&
        !suppressesDeadlines &&
        end != null &&
        taskIsOverdue(endDate: end, now: now, zone: zone)) {
      buckets[TaskListDateBucket.overdue]!.add(task);
      continue;
    }

    if (open && dueDay != null && dueDay == today) {
      buckets[TaskListDateBucket.today]!.add(task);
      continue;
    }

    if (dueDay != null && dueDay.isAfter(today)) {
      buckets[TaskListDateBucket.upcoming]!.add(task);
      continue;
    }

    if (dueDay != null && dueDay.isBefore(today)) {
      buckets[TaskListDateBucket.upcoming]!.add(task);
      continue;
    }

    if (start != null) {
      buckets[TaskListDateBucket.upcoming]!.add(task);
      continue;
    }

    buckets[TaskListDateBucket.noDate]!.add(task);
  }

  return [
    for (final bucket in TaskListDateBucket.values)
      if (buckets[bucket]!.isNotEmpty)
        TaskListDateGroup(bucket: bucket, tasks: buckets[bucket]!),
  ];
}
