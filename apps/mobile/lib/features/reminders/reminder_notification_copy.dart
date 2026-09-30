import 'package:intl/intl.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

({String title, String body}) reminderNotificationCopy(
  ReminderPlanEntry entry,
  AppLocalizations l10n,
) {
  if (entry.kind == ReminderKind.task) {
    return (
      title: '${l10n.notificationTaskAppLabel}: ${entry.title}',
      body: l10n.remindersTaskTitle,
    );
  }

  final when = switch (entry.offset) {
    '3d' => l10n.remindersIn3d,
    '1d' => l10n.remindersIn1d,
    '12h' => l10n.remindersIn12h,
    '3h' => l10n.remindersIn3h,
    '1h' => l10n.remindersIn1h,
    _ => null,
  };
  final wall = calendarWallDate(entry.dueAt, entry.timezone);
  final format = DateFormat.yMMMd(l10n.localeName);
  final occurrence = entry.isAllDay
      ? format.format(wall)
      : format.add_jm().format(wall);
  final timezone = entry.timezone ?? entry.dueAt.toLocal().timeZoneName;
  return (
    title: '${l10n.navCalendar}: ${entry.title}',
    body: l10n.remindersOccurrenceDetails(
      when ?? l10n.remindersEventTitle,
      occurrence,
      timezone,
    ),
  );
}
