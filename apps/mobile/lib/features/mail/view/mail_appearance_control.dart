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
      // Original email colors remain readable when preferences are unavailable.
    }
  }

  Future<void> select(MailMessageAppearance? appearance) async {
    _selected = true;
    value = appearance;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(storageKey, appearance?.name ?? 'auto');
    } on Exception {
      // Keep the current session choice even if disk storage is unavailable.
    }
  }

  Future<void> selectMode(String id) => select(
    id == 'auto' ? null : MailMessageAppearance.values.byName(id),
  );
}

Map<String, String> mailAppearanceLabels(BuildContext context) => {
  'auto': context.l10n.mailAppearanceAppTheme,
  MailMessageAppearance.dark.name: context.l10n.settingsThemeDark,
  MailMessageAppearance.original.name: context.l10n.mailAppearanceOriginal,
  MailMessageAppearance.light.name: context.l10n.settingsThemeLight,
};

/// The appearance a message renders with: the saved choice, else the app's
/// own theme, so HTML mail is not a white sheet inside a dark app.
MailMessageAppearance mailEffectiveAppearance(BuildContext context) =>
    MailAppearancePreference.instance.value ??
    (Theme.of(context).brightness == Brightness.dark
        ? MailMessageAppearance.dark
        : MailMessageAppearance.original);

class MailAppearanceControl extends StatelessWidget {
  const MailAppearanceControl({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final preference = MailAppearancePreference.instance;
    final current = preference.value?.name ?? 'auto';
    return PopupMenuButton<String>(
      tooltip: l10n.mailMessageAppearance,
      initialValue: current,
      icon: const Icon(Icons.contrast_rounded),
      onSelected: (value) => unawaited(preference.selectMode(value)),
      itemBuilder: (_) => [
        for (final choice in mailAppearanceLabels(context).entries)
          CheckedPopupMenuItem(
            value: choice.key,
            checked: current == choice.key,
            child: Text(choice.value),
          ),
      ],
    );
  }
}
