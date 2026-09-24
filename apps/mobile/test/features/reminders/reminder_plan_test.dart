import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';

void main() {
  test('plans future task and event reminders in delivery order', () {
    final now = DateTime(2026, 9, 24, 10);
    final plan = buildReminderPlan(
      now: now,
      workspaceId: 'ws',
      tasks: [
        UserTask(
          id: 'task',
          name: 'Finish report',
          endDate: now.add(const Duration(days: 1, hours: 2)),
        ),
      ],
      events: [
        CalendarEvent(
          id: 'event',
          title: 'Planning',
          startAt: now.add(const Duration(hours: 5)),
        ),
      ],
      taskOffsets: const ['1d', '3h', '1h'],
      eventOffsets: const ['3h', '1h'],
    );

    expect(plan, hasLength(5));
    expect(plan.first.entityId, 'task');
    expect(plan.first.scheduledAt, now.add(const Duration(hours: 2)));
    expect(plan[1].entityId, 'event');
    expect(plan[1].scheduledAt, now.add(const Duration(hours: 2)));
    expect(plan.last.entityId, 'task');
    expect(plan.map((entry) => entry.notificationId).toSet(), hasLength(5));
  });

  test('skips completed and past items and caps pending alerts', () {
    final now = DateTime(2026, 9, 24, 10);
    const doneList = TaskListInfo(id: 'done', status: 'done');
    final plan = buildReminderPlan(
      now: now,
      workspaceId: 'ws',
      tasks: [
        UserTask(
          id: 'done',
          endDate: now.add(const Duration(days: 5)),
          list: doneList,
        ),
        UserTask(id: 'past', endDate: now.subtract(const Duration(hours: 1))),
        UserTask(id: 'active', endDate: now.add(const Duration(days: 4))),
      ],
      events: const [],
      taskOffsets: defaultReminderOffsets,
      eventOffsets: const [],
      limit: 2,
    );

    expect(plan, hasLength(2));
    expect(plan.every((entry) => entry.entityId == 'active'), isTrue);
  });
}
