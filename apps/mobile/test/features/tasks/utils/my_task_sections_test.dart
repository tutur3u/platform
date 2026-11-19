import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/my_task_sections.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';

void main() {
  test('cached tasks follow the selected timezone across midnight', () {
    final due = DateTime.utc(2026, 11, 18, 16, 50);
    final yesterday = UserTask(id: 'previous', endDate: due);
    final tomorrow = UserTask(
      id: 'following',
      endDate: DateTime.utc(2026, 11, 19, 16),
    );
    const unscheduled = UserTask(id: 'floating');
    const completed = UserTask(id: 'completed');
    final cached = TaskListState(
      todayTasks: [yesterday],
      upcomingTasks: [tomorrow, unscheduled, completed],
      completedTasks: const [completed],
    );
    const zone = 'Asia/Ho_Chi_Minh';
    final beforeMidnight = DateTime.utc(2026, 11, 18, 16, 59, 59);
    final afterMidnight = DateTime.utc(2026, 11, 18, 17);

    expect(projectMyTasks(cached, now: beforeMidnight, zone: zone), {
      TaskListSection.overdue: <UserTask>[],
      TaskListSection.today: [yesterday],
      TaskListSection.upcoming: [tomorrow],
      TaskListSection.noDate: [unscheduled],
      TaskListSection.completed: [completed],
    });
    expect(projectMyTasks(cached, now: afterMidnight, zone: zone), {
      TaskListSection.overdue: [yesterday],
      TaskListSection.today: [tomorrow],
      TaskListSection.upcoming: <UserTask>[],
      TaskListSection.noDate: [unscheduled],
      TaskListSection.completed: [completed],
    });
    expect(
      myTaskDueSection(due, now: afterMidnight, zone: 'America/Los_Angeles'),
      TaskListSection.today,
    );
    expect(
      taskTimeUntilNextDay(beforeMidnight, zone),
      const Duration(seconds: 1),
    );
  });

  test('assigned task relations survive the API and cache shapes', () {
    final task = UserTask.fromJson(const {
      'id': 'demo-task',
      'name': 'Write release notes',
      'assignees': [
        {
          'user': {'id': 'alex', 'display_name': 'Alex Doe'},
        },
        {'user': null},
      ],
      'labels': [
        {
          'label': {'id': 'review', 'name': 'Review'},
        },
      ],
    });
    expect(task.assignees.single.displayName, 'Alex Doe');
    expect(task.labels.single.name, 'Review');
    expect(UserTask.fromJson(task.toJson()), task);
  });

  test('no due date stays in No date even with an old start', () {
    final task = UserTask(id: 'start-only', startDate: DateTime.utc(2025));
    final sections = projectMyTasks(
      TaskListState(overdueTasks: [task]),
      now: DateTime.utc(2026),
      zone: 'UTC',
    );
    expect(sections[TaskListSection.overdue], isEmpty);
    expect(sections[TaskListSection.noDate], [task]);
  });
}
