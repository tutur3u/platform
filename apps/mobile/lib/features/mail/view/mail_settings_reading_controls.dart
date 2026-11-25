part of 'mail_settings_page.dart';

extension _MailSettingsReadingControls on _MailSettingsPageState {
  List<Widget> _readingControls() => [
    ListenableBuilder(
      listenable: MailReadingPreferences.instance,
      builder: (context, _) {
        final preferences = MailReadingPreferences.instance;
        final l10n = context.l10n;
        return Column(
          children: [
            SettingsChoiceRow<MailAfterArchive>(
              icon: Icons.archive_outlined,
              title: l10n.mailAfterArchive,
              value: preferences.afterArchive,
              options: [
                AppSelectOption(
                  value: MailAfterArchive.next,
                  label: l10n.mailAfterArchiveNext,
                ),
                AppSelectOption(
                  value: MailAfterArchive.list,
                  label: l10n.mailAfterArchiveList,
                ),
              ],
              onChanged: (value) =>
                  unawaited(preferences.setAfterArchive(value)),
            ),
            SettingsSwitchRow(
              icon: Icons.keyboard_outlined,
              title: l10n.mailKeyboardShortcuts,
              value: preferences.keyboardEnabled,
              onChanged: (value) =>
                  unawaited(preferences.setKeyboardEnabled(value)),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.help_outline,
              title: l10n.mailKeyboardReference,
              onTap: () => showMailKeyboardHelp(context),
            ),
          ],
        );
      },
    ),
    ValueListenableBuilder(
      valueListenable: MailAppearancePreference.instance,
      builder: (context, mode, _) => SettingsChoiceRow<String>(
        icon: Icons.contrast_rounded,
        title: context.l10n.mailMessageAppearance,
        value: mode?.name ?? 'auto',
        options: [
          for (final choice in mailAppearanceLabels(context).entries)
            AppSelectOption(value: choice.key, label: choice.value),
        ],
        onChanged: (id) => unawaited(
          MailAppearancePreference.instance.selectMode(id),
        ),
      ),
    ),
  ];
}
