import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The reader's one-tap default action. Reply is always on the action bar,
/// so it is not a choice here; a saved `reply` falls back to Archive.
enum MailPrimaryAction { archive, trash, markUnread }

extension MailPrimaryActionPresentation on MailPrimaryAction {
  String label(BuildContext context) => switch (this) {
    MailPrimaryAction.archive => context.l10n.mailArchive,
    MailPrimaryAction.trash => context.l10n.commonDelete,
    MailPrimaryAction.markUnread => context.l10n.mailMarkUnread,
  };
}

class MailPrimaryActionPreference extends ValueNotifier<MailPrimaryAction> {
  MailPrimaryActionPreference() : super(MailPrimaryAction.archive);

  static final instance = MailPrimaryActionPreference();
  static const storageKey = 'mail.primaryAction';
  Future<void>? _loading;
  bool _selected = false;

  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final name = prefs.getString(storageKey);
      final action = MailPrimaryAction.values
          .where((item) => item.name == name)
          .firstOrNull;
      if (!_selected) {
        if (action != null) {
          value = action;
        } else if (name != null) {
          // Migrate retired choices (such as `reply`) explicitly to Archive.
          value = MailPrimaryAction.archive;
          await prefs.setString(storageKey, MailPrimaryAction.archive.name);
        }
      }
    } on Exception {
      // Keep Archive as the default if preference storage is unavailable.
    }
  }

  Future<void> select(MailPrimaryAction action) async {
    _selected = true;
    value = action;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(storageKey, action.name);
    } on Exception {
      // The selected action remains usable for this session.
    }
  }
}
