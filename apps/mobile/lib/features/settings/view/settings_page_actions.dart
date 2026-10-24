part of 'settings_page.dart';

/// Preference editors and labels for the Settings page. Each opens a child
/// choice and writes only an explicit selection.
mixin _SettingsPageActions on State<_SettingsView> {
  final SettingsRepository _settingsRepository = SettingsRepository();

  /// Hides the "New" chip until the stored flag says otherwise.
  bool _appearanceIntroSeen = true;

  Future<void> _loadAppearanceIntro() async {
    final seen = await _settingsRepository.getAppearanceIntroSeen();
    if (mounted && seen != _appearanceIntroSeen) {
      setState(() => _appearanceIntroSeen = seen);
    }
  }

  /// The first visit highlights the featured Aurora theme once.
  void _openAppearance() {
    final highlight = !_appearanceIntroSeen;
    if (highlight) setState(() => _appearanceIntroSeen = true);
    unawaited(_settingsRepository.setAppearanceIntroSeen());
    unawaited(
      context.push(
        highlight
            ? '${Routes.settingsAppearance}?highlight='
                  '${AppearanceThemeId.aurora.name}'
            : Routes.settingsAppearance,
      ),
    );
  }

  String _localeDisplayName(
    Locale systemLocale,
    Locale? selectedLocale,
    AppLocalizations l10n,
  ) {
    final locale = selectedLocale ?? systemLocale;
    switch (locale.languageCode) {
      case 'en':
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · ${l10n.settingsLanguageEnglish}'
            : l10n.settingsLanguageEnglish;
      case 'vi':
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · '
                  '${l10n.settingsLanguageVietnamese}'
            : l10n.settingsLanguageVietnamese;
      default:
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · ${locale.languageCode}'
            : locale.languageCode;
    }
  }

  Future<void> _showHapticsDialog() async {
    final l10n = context.l10n;
    final selected = await showSettingsChoiceDialog<bool>(
      context: context,
      title: l10n.settingsHaptics,
      currentValue: AppHaptics.enabled,
      options: [
        SettingsChoiceOption(
          value: true,
          label: l10n.commonOn,
          icon: LucideIcons.vibrate,
        ),
        SettingsChoiceOption(
          value: false,
          label: l10n.commonOff,
          icon: LucideIcons.bellOff,
        ),
      ],
    );
    if (selected != null && mounted && selected != AppHaptics.enabled) {
      await AppHaptics.setEnabled(value: selected);
      if (mounted) setState(() {});
    }
  }

  Future<void> _showLanguageDialog() async {
    final l10n = context.l10n;
    final cubit = context.read<LocaleCubit>();
    final currentValue = cubit.state.locale?.languageCode ?? 'system';

    final selected = await showSettingsChoiceDialog<String>(
      context: context,
      title: l10n.settingsLanguage,
      description: l10n.settingsLanguageDescription,
      currentValue: currentValue,
      options: [
        SettingsChoiceOption(
          value: 'system',
          label: l10n.settingsLanguageSystem,
          icon: LucideIcons.monitorSmartphone,
          description: l10n.settingsLanguageSystemDescription,
        ),
        SettingsChoiceOption(
          value: 'en',
          label: l10n.settingsLanguageEnglish,
          icon: LucideIcons.languages,
        ),
        SettingsChoiceOption(
          value: 'vi',
          label: l10n.settingsLanguageVietnamese,
          icon: LucideIcons.languages,
        ),
      ],
    );

    if (selected == null || !mounted) {
      return;
    }

    if (selected == 'system') {
      await cubit.clearLocale();
      return;
    }

    await cubit.setLocale(Locale(selected));
  }

  Future<void> _showSignOutDialog() async {
    final authCubit = context.read<AuthCubit>();
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authLogOutConfirmDialogTitle,
      description: context.l10n.authLogOutConfirmDialogBody,
      confirmLabel: context.l10n.authLogOut,
      isDestructive: true,
    );

    if (confirmed == true && context.mounted) {
      await authCubit.signOutCurrentAccount();
    }
  }
}
