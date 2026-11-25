import 'package:intl/intl.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

({String title, String body}) reminderNotificationCopy(
  ReminderPlanEntry entry,
  AppLocalizations l10n,
) {
  final leadTime = switch (entry.offset) {
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
  if (entry.kind == ReminderKind.task) {
    final at = calendarWallDate(entry.scheduledAt, entry.timezone);
    final sameDay =
        at.year == wall.year && at.month == wall.month && at.day == wall.day;
    final details = switch (entry.offset) {
      taskOverdueOffset => l10n.remindersTaskOverdue(occurrence),
      _ when entry.isAllDay && sameDay => l10n.remindersTaskDueToday,
      _ when leadTime != null => l10n.remindersTaskDueIn(
        l10n.localeName == 'vi' ? leadTime : leadTime.toLowerCase(),
        occurrence,
      ),
      _ => l10n.remindersTaskDue(occurrence),
    };
    final location = entry.taskLocation?.trim();
    return (
      title: '${l10n.notificationTaskAppLabel}: ${entry.title}',
      body: location == null || location.isEmpty
          ? details
          : l10n.remindersOccurrenceDetails(details, location),
    );
  }
  return (
    title: '${l10n.navCalendar}: ${entry.title}',
    body: l10n.remindersOccurrenceDetails(
      leadTime ?? l10n.remindersEventTitle,
      occurrence,
    ),
  );
}

({String title, String body}) reminderGroupCopy(
  List<ReminderPlanEntry> group,
  AppLocalizations l10n,
) {
  if (group.length == 1) return reminderNotificationCopy(group.first, l10n);
  final overdue = group.first.offset == taskOverdueOffset;
  final sample = group.take(3).map((entry) {
    final copy = reminderNotificationCopy(entry, l10n);
    return '${entry.title} — ${copy.body}';
  });
  return (
    title: overdue
        ? l10n.remindersTaskOverdueGroupTitle(group.length)
        : l10n.remindersTaskGroupTitle(group.length),
    body: [
      ...sample,
      if (group.length > 3) l10n.remindersTaskGroupMore(group.length - 3),
    ].join('\n'),
  );
}
