import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MailSwipeAction { archive, trash, read, star, move, snooze, mute, none }

extension MailSwipePresentation on MailSwipeAction {
  IconData get icon => switch (this) {
    MailSwipeAction.archive => Icons.archive_outlined,
    MailSwipeAction.trash => Icons.delete_outline,
    MailSwipeAction.read => Icons.mark_email_read_outlined,
    MailSwipeAction.star => Icons.star_outline,
    MailSwipeAction.move => Icons.drive_file_move_outlined,
    MailSwipeAction.snooze => Icons.snooze_outlined,
    MailSwipeAction.mute => Icons.volume_off_outlined,
    MailSwipeAction.none => Icons.block,
  };

  String label(BuildContext context) => switch (this) {
    MailSwipeAction.archive => context.l10n.mailArchive,
    MailSwipeAction.trash => context.l10n.mailTrash,
    MailSwipeAction.read => context.l10n.mailSwipeRead,
    MailSwipeAction.star => context.l10n.mailSwipeStar,
    MailSwipeAction.move => context.l10n.mailSwipeMove,
    MailSwipeAction.snooze => context.l10n.mailSnooze,
    MailSwipeAction.mute => context.l10n.mailMute,
    MailSwipeAction.none => context.l10n.mailSwipeNone,
  };
}

/// Stores gesture choices only, never mailbox identifiers or email contents.
class MailSwipePreferences extends ChangeNotifier {
  MailSwipeAction left = MailSwipeAction.archive;
  MailSwipeAction right = MailSwipeAction.read;
  bool _edited = false;
  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_edited || _disposed) return;
      left = decode(prefs.getString('mail.swipe.left'), left);
      right = decode(prefs.getString('mail.swipe.right'), right);
      notifyListeners();
    } on Exception {
      // Defaults remain usable when preference storage is unavailable.
    }
  }

  static MailSwipeAction decode(String? name, MailSwipeAction fallback) =>
      MailSwipeAction.values
          .where((action) => action.name == name)
          .firstOrNull ??
      fallback;

  Future<void> select({
    required bool swipeLeft,
    required MailSwipeAction action,
  }) async {
    _edited = true;
    if (swipeLeft) {
      left = action;
    } else {
      right = action;
    }
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'mail.swipe.${swipeLeft ? 'left' : 'right'}',
        action.name,
      );
    } on Exception {
      // Retain the current session choice.
    }
  }
}

Future<void> showMailSwipeSettings(
  BuildContext context,
  MailSwipePreferences preferences,
) => showAdaptiveSheet<void>(
  context: context,
  builder: (sheetContext) => ListenableBuilder(
    listenable: preferences,
    builder: (context, _) => AppDialogScaffold(
      title: context.l10n.mailSwipeActions,
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final left in [false, true])
              ListTile(
                leading: Icon(
                  left ? Icons.swipe_left_outlined : Icons.swipe_right_outlined,
                ),
                title: Text(
                  left
                      ? context.l10n.mailSwipeLeft
                      : context.l10n.mailSwipeRight,
                ),
                subtitle: Text(
                  (left ? preferences.left : preferences.right).label(context),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  final selected = await showAdaptiveSheet<MailSwipeAction>(
                    context: context,
                    builder: (pickerContext) => AppDialogScaffold(
                      title: left
                          ? context.l10n.mailSwipeLeft
                          : context.l10n.mailSwipeRight,
                      child: Material(
                        color: Colors.transparent,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (final action in MailSwipeAction.values)
                              ListTile(
                                leading: Icon(action.icon),
                                title: Text(action.label(context)),
                                trailing:
                                    (left
                                            ? preferences.left
                                            : preferences.right) ==
                                        action
                                    ? const Icon(Icons.check)
                                    : null,
                                onTap: () =>
                                    Navigator.of(pickerContext).pop(action),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                  if (context.mounted && selected != null) {
                    await preferences.select(swipeLeft: left, action: selected);
                  }
                },
              ),
          ],
        ),
      ),
    ),
  ),
);

Future<DateTime?> chooseMailSnoozeTime(BuildContext context) async {
  final l10n = context.l10n;
  final hours = await showAdaptiveSheet<int>(
    context: context,
    useRootNavigator: true,
    builder: (sheetContext) => AppDialogScaffold(
      title: l10n.mailSnooze,
      child: Material(
        color: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final option in {
              1: l10n.mailSnoozeHour,
              24: l10n.mailSnoozeDay,
              168: l10n.mailSnoozeWeek,
              0: l10n.mailSnoozeCustom,
            }.entries)
              ListTile(
                leading: Icon(switch (option.key) {
                  1 => Icons.schedule_outlined,
                  24 => Icons.today_outlined,
                  168 => Icons.date_range_outlined,
                  _ => Icons.edit_calendar_outlined,
                }),
                title: Text(option.value),
                onTap: () => Navigator.of(sheetContext).pop(option.key),
              ),
          ],
        ),
      ),
    ),
  );
  if (hours == null || !context.mounted) return null;
  final now = DateTime.now();
  if (hours > 0) return now.add(Duration(hours: hours));
  final date = await showDatePicker(
    context: context,
    initialDate: now.add(const Duration(days: 1)),
    firstDate: now,
    lastDate: now.add(const Duration(days: 364)),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: const TimeOfDay(hour: 9, minute: 0),
  );
  if (time == null || !context.mounted) return null;
  final selected = DateTime(
    date.year,
    date.month,
    date.day,
    time.hour,
    time.minute,
  );
  if (!selected.isAfter(DateTime.now())) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(l10n.mailSnoozeFuture)));
    return null;
  }
  return selected;
}
