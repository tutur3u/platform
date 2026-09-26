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

  test('does not remind for Google working locations', () {
    final now = DateTime(2026, 9, 24, 10);
    final tomorrow = DateTime(2026, 9, 25);
    final nextDay = DateTime(2026, 9, 26);
    final plan = buildReminderPlan(
      now: now,
      workspaceId: 'ws',
      tasks: const [],
      events: [
        CalendarEvent(
          id: 'typed-location',
          title: 'At home',
          provider: 'google',
          schedulingMetadata: const {'google_event_type': 'workingLocation'},
          startAt: tomorrow,
          endAt: nextDay,
        ),
        CalendarEvent(
          id: 'old-location',
          title: 'Home',
          provider: 'google',
          startAt: tomorrow,
          endAt: nextDay,
        ),
        CalendarEvent(
          id: 'school-location',
          title: 'Campus',
          provider: 'google',
          schedulingMetadata: const {
            'google_event_type': 'workingLocation',
            'google_working_location_type': 'customLocation',
            'google_working_location_label': 'School',
          },
          startAt: tomorrow,
          endAt: nextDay,
        ),
        CalendarEvent(
          id: 'first-party-school',
          title: 'School',
          provider: 'tuturuuu',
          startAt: tomorrow,
          endAt: nextDay,
        ),
        CalendarEvent(
          id: 'ordinary-event',
          title: 'Home renovation',
          provider: 'google',
          startAt: tomorrow,
          endAt: nextDay,
        ),
      ],
      taskOffsets: const [],
      eventOffsets: const ['12h'],
    );

    expect(plan.map((entry) => entry.entityId), ['ordinary-event']);
    expect(
      CalendarEvent(
        id: 'typed-school',
        title: 'Campus',
        provider: 'google',
        schedulingMetadata: const {
          'google_event_type': 'workingLocation',
          'google_working_location_type': 'customLocation',
          'google_working_location_label': 'School',
        },
        startAt: tomorrow,
        endAt: nextDay,
      ).workingLocationKind,
      WorkingLocationKind.school,
    );
    expect(
      CalendarEvent(
        id: 'school',
        title: 'School',
        provider: 'google',
        startAt: tomorrow,
        endAt: nextDay,
      ).workingLocationKind,
      WorkingLocationKind.school,
    );
  });

  test('keeps the all-day designation for calendar notification copy', () {
    final plan = buildReminderPlan(
      now: DateTime(2026, 12, 20),
      workspaceId: 'ws',
      tasks: const [],
      events: [
        CalendarEvent(
          id: 'christmas',
          title: 'Christmas',
          startAt: DateTime(2026, 12, 25),
          endAt: DateTime(2026, 12, 26),
        ),
      ],
      taskOffsets: const [],
      eventOffsets: const ['3d'],
    );

    expect(plan.single.title, 'Christmas');
    expect(plan.single.isAllDay, isTrue);
  });
}
