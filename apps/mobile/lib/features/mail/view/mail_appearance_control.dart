import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Visual preference only. No account, mailbox, or message data is stored here.
class MailAppearancePreference extends ValueNotifier<MailMessageAppearance?> {
  MailAppearancePreference() : super(null);

  static final instance = MailAppearancePreference();
  static const storageKey = 'mail.messageAppearance';
  Future<void>? _loading;
  bool _selected = false;

  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(storageKey);
      if (!_selected) {
        value = MailMessageAppearance.values
            .where((mode) => mode.name == saved)
            .firstOrNull;
      }
    } on Exception {
      // Follow the app theme when preferences are unavailable.
    }
  }

  Future<void> select(MailMessageAppearance appearance) async {
    _selected = true;
    value = appearance;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(storageKey, appearance.name);
    } on Exception {
      // Keep the current session choice even if disk storage is unavailable.
    }
  }
}

class MailAppearanceControl extends StatelessWidget {
  const MailAppearanceControl({required this.appearance, super.key});

  final MailMessageAppearance appearance;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final choices = {
      MailMessageAppearance.original: l10n.mailAppearanceOriginal,
      MailMessageAppearance.light: l10n.settingsThemeLight,
      MailMessageAppearance.dark: l10n.settingsThemeDark,
    };
    return PopupMenuButton<MailMessageAppearance>(
      tooltip: l10n.mailMessageAppearance,
      initialValue: appearance,
      icon: const Icon(Icons.contrast_rounded),
      onSelected: (value) =>
          unawaited(MailAppearancePreference.instance.select(value)),
      itemBuilder: (_) => [
        for (final choice in choices.entries)
          CheckedPopupMenuItem(
            value: choice.key,
            checked: appearance == choice.key,
            child: Text(choice.value),
          ),
      ],
    );
  }
}
