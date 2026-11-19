import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

Map<TaskListSection, List<UserTask>> projectMyTasks(
  TaskListState state, {
  required DateTime now,
  String? zone,
}) {
  final sections = {
    for (final section in TaskListSection.values) section: <UserTask>[],
  };
  final seen = <String>{};
  for (final task in state.completedTasks) {
    if (seen.add(task.id)) sections[TaskListSection.completed]!.add(task);
  }
  for (final task in [
    ...state.overdueTasks,
    ...state.todayTasks,
    ...state.upcomingTasks,
  ]) {
    if (!seen.add(task.id)) continue;
    final section = task.isDone
        ? TaskListSection.completed
        : myTaskDueSection(task.endDate, now: now, zone: zone);
    sections[section]!.add(task);
  }
  for (final section in [
    TaskListSection.overdue,
    TaskListSection.today,
    TaskListSection.upcoming,
  ]) {
    sections[section]!.sort((a, b) => a.endDate!.compareTo(b.endDate!));
  }
  return sections;
}
