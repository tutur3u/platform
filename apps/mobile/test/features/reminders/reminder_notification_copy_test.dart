import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/reminders/reminder_notification_copy.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

void main() {
  ReminderPlanEntry entry(
    ReminderKind kind,
    String offset, {
    bool allDay = false,
  }) => ReminderPlanEntry(
    kind: kind,
    workspaceId: 'workspace',
    entityId: 'event',
    title: 'Team planning',
    dueAt: DateTime(2026, 9, 30),
    offset: offset,
    scheduledAt: DateTime(2026, 9, 27),
    notificationId: 1,
    isAllDay: allDay,
  );

  test('calendar alerts put event name in title and lead time in body', () {
    final l10n = AppLocalizationsEn();
    expect(reminderNotificationCopy(entry(ReminderKind.event, '3d'), l10n), (
      title: 'Calendar: Team planning',
      body: 'In 3 days',
    ));
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '1d', allDay: true),
        l10n,
      ),
      (title: 'Calendar: Team planning', body: 'Tomorrow'),
    );
  });

  test('calendar alert copy is localized in Vietnamese', () {
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '3d'),
        AppLocalizationsVi(),
      ),
      (title: 'Lịch: Team planning', body: 'Còn 3 ngày'),
    );
  });

  test('task alert uses the task name in the title', () {
    final l10n = AppLocalizationsEn();
    expect(reminderNotificationCopy(entry(ReminderKind.task, '3d'), l10n), (
      title: 'Task: Team planning',
      body: l10n.remindersTaskTitle,
    ));
  });
}
