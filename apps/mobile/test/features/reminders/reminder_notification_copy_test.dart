import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/reminders/reminder_notification_copy.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

void main() {
  setUpAll(initializeDateFormatting);
  ReminderPlanEntry entry(
    ReminderKind kind,
    String offset, {
    bool allDay = false,
    String timezone = 'UTC',
  }) => ReminderPlanEntry(
    kind: kind,
    workspaceId: 'workspace',
    entityId: 'event',
    title: 'Team planning',
    dueAt: DateTime.utc(2026, 9, 30, 12),
    offset: offset,
    scheduledAt: DateTime(2026, 9, 27),
    notificationId: 1,
    isAllDay: allDay,
    timezone: timezone,
  );

  test('calendar alerts put event name in title and lead time in body', () {
    final l10n = AppLocalizationsEn();
    expect(reminderNotificationCopy(entry(ReminderKind.event, '3d'), l10n), (
      title: 'Calendar: Team planning',
      body: 'In 3 days · Sep 30, 2026 12:00\u202fPM (UTC)',
    ));
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '1d', allDay: true),
        l10n,
      ),
      (title: 'Calendar: Team planning', body: 'Tomorrow · Sep 30, 2026 (UTC)'),
    );
  });

  test('calendar alert copy is localized in Vietnamese', () {
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '3d'),
        AppLocalizationsVi(),
      ),
      (
        title: 'Lịch: Team planning',
        body: 'Còn 3 ngày · 30 thg 9, 2026 12:00 (UTC)',
      ),
    );
  });

  test('task alert uses the task name in the title', () {
    final l10n = AppLocalizationsEn();
    expect(reminderNotificationCopy(entry(ReminderKind.task, '3d'), l10n), (
      title: 'Task: Team planning',
      body: l10n.remindersTaskTitle,
    ));
  });
  for (final allDay in [false, true]) {
    test('occurrence copy shows '
        '${allDay ? 'date only' : 'projected time'} and zone', () {
      final copy = reminderNotificationCopy(
        ReminderPlanEntry(
          kind: ReminderKind.event,
          workspaceId: 'ws',
          entityId: 'occurrence',
          title: 'Daily review',
          dueAt: DateTime.utc(2026, 10, 5, allDay ? 2 : 0, allDay ? 0 : 30),
          offset: '1d',
          scheduledAt: DateTime.utc(2026, 10, 4),
          notificationId: 1,
          timezone: allDay ? 'Asia/Ho_Chi_Minh' : 'America/Los_Angeles',
          isAllDay: allDay,
        ),
        AppLocalizationsEn(),
      );
      expect(
        copy.body,
        allDay
            ? 'Tomorrow · Oct 5, 2026 (Asia/Ho_Chi_Minh)'
            : 'Tomorrow · Oct 4, 2026 5:30\u202fPM (America/Los_Angeles)',
      );
    });
  }
}
