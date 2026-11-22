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
    scheduledAt: offset == taskOverdueOffset
        ? DateTime.utc(2026, 9, 30, 13)
        : DateTime.utc(2026, 9, 30, 11),
    notificationId: 1,
    isAllDay: allDay,
    timezone: timezone,
  );

  test('calendar alerts put event name in title and lead time in body', () {
    final l10n = AppLocalizationsEn();
    expect(reminderNotificationCopy(entry(ReminderKind.event, '3d'), l10n), (
      title: 'Calendar: Team planning',
      body: 'In 3 days · Sep 30, 2026 12:00\u202fPM',
    ));
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '1d', allDay: true),
        l10n,
      ),
      (title: 'Calendar: Team planning', body: 'Tomorrow · Sep 30, 2026'),
    );
  });

  test('calendar alert copy is localized in Vietnamese', () {
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.event, '3d'),
        AppLocalizationsVi(),
      ),
      (title: 'Lịch: Team planning', body: 'Còn 3 ngày · 30 thg 9, 2026 12:00'),
    );
  });

  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    test('calendar alert omits Asia/Saigon label in ${l10n.localeName}', () {
      final copy = reminderNotificationCopy(
        entry(ReminderKind.event, '3d', timezone: 'Asia/Saigon'),
        l10n,
      );
      expect(copy.title, isNot(contains('Asia/Saigon')));
      expect(copy.body, isNot(contains('Asia/Saigon')));
      expect(copy.body, isNot(contains('(')));
      expect(
        copy.body,
        l10n.localeName == 'en'
            ? 'In 3 days · Sep 30, 2026 7:00\u202fPM'
            : 'Còn 3 ngày · 30 thg 9, 2026 19:00',
      );
    });
  }

  test('task alert gives the lead time and deadline in its zone', () {
    final l10n = AppLocalizationsEn();
    expect(
      reminderNotificationCopy(
        entry(ReminderKind.task, '1h', timezone: 'Asia/Ho_Chi_Minh'),
        l10n,
      ),
      (
        title: 'Task: Team planning',
        body: 'Due in 1 hour · Sep 30, 2026 7:00\u202fPM',
      ),
    );
  });
  test('task alert distinguishes today from overdue in both languages', () {
    final today = entry(ReminderKind.task, '1h', allDay: true);
    final overdue = entry(ReminderKind.task, taskOverdueOffset);
    expect(
      reminderNotificationCopy(today, AppLocalizationsEn()).body,
      'Due today',
    );
    expect(
      reminderNotificationCopy(today, AppLocalizationsVi()).body,
      'Đến hạn hôm nay',
    );
    expect(
      reminderNotificationCopy(overdue, AppLocalizationsEn()).body,
      'Overdue since Sep 30, 2026 12:00\u202fPM',
    );
    expect(
      reminderNotificationCopy(overdue, AppLocalizationsVi()).body,
      'Quá hạn từ 30 thg 9, 2026 12:00',
    );
  });
  for (final allDay in [false, true]) {
    test('occurrence copy shows '
        '${allDay ? 'date only' : 'projected time'} without a zone label', () {
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
      expect(copy.title, isNot(contains('(')));
      expect(copy.body, isNot(contains('(')));
      expect(
        copy.body,
        allDay
            ? 'Tomorrow · Oct 5, 2026'
            : 'Tomorrow · Oct 4, 2026 5:30\u202fPM',
      );
    });
  }
}
