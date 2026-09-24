import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MailPrimaryAction { archive, trash, markUnread, reply }

extension MailPrimaryActionPresentation on MailPrimaryAction {
  IconData get icon => switch (this) {
    MailPrimaryAction.archive => Icons.archive_outlined,
    MailPrimaryAction.trash => Icons.delete_outline,
    MailPrimaryAction.markUnread => Icons.mark_email_unread_outlined,
    MailPrimaryAction.reply => Icons.reply_outlined,
  };

  String label(BuildContext context) => switch (this) {
    MailPrimaryAction.archive => context.l10n.mailArchive,
    MailPrimaryAction.trash => context.l10n.mailTrash,
    MailPrimaryAction.markUnread => context.l10n.mailMarkUnread,
    MailPrimaryAction.reply => context.l10n.mailReply,
  };

  String? get stateAction => switch (this) {
    MailPrimaryAction.archive => 'archive',
    MailPrimaryAction.trash => 'trash',
    MailPrimaryAction.markUnread => 'mark_unread',
    MailPrimaryAction.reply => null,
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
      if (!_selected && action != null) value = action;
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
