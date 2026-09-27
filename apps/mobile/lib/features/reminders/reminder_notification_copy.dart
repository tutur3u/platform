import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

({String title, String body}) reminderNotificationCopy(
  ReminderPlanEntry entry,
  AppLocalizations l10n,
) {
  if (entry.kind == ReminderKind.task) {
    return (title: l10n.remindersTaskTitle, body: entry.title);
  }

  final when = switch (entry.offset) {
    '3d' => l10n.remindersIn3d,
    '1d' => l10n.remindersIn1d,
    '12h' => l10n.remindersIn12h,
    '3h' => l10n.remindersIn3h,
    '1h' => l10n.remindersIn1h,
    _ => null,
  };
  return (
    title: when == null
        ? l10n.remindersEventTitle
        : l10n.remindersCalendarTiming(when),
    body: entry.title,
  );
}
