part of 'settings_page.dart';

/// Preference editors and labels for the Settings page. Each opens a child
/// choice and writes only an explicit selection.
mixin _SettingsPageActions on State<_SettingsView> {
  final SettingsRepository _settingsRepository = SettingsRepository();
  bool _disableDefaultTaskBoardNavigation = false;

  String _calendarDisplayName(
    CalendarSettingsState state,
    AppLocalizations l10n,
  ) {
    final effective = state.userPreference != FirstDayOfWeek.auto_
        ? state.userPreference
        : state.workspacePreference != FirstDayOfWeek.auto_
        ? state.workspacePreference
        : FirstDayOfWeek.auto_;

    switch (effective) {
      case FirstDayOfWeek.auto_:
        return l10n.settingsFirstDayAuto;
      case FirstDayOfWeek.sunday:
        return l10n.settingsFirstDaySunday;
      case FirstDayOfWeek.monday:
        return l10n.settingsFirstDayMonday;
      case FirstDayOfWeek.saturday:
        return l10n.settingsFirstDaySaturday;
    }
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

  Future<void> _loadDefaultTaskBoardNavigationPreference() async {
    final value = await _settingsRepository
        .getDisableDefaultTaskBoardNavigation();
    if (!mounted) return;
    setState(() => _disableDefaultTaskBoardNavigation = value);
  }

  Future<void> _showDefaultTaskBoardDialog() async {
    final l10n = context.l10n;
    final selected = await showSettingsChoiceDialog<bool>(
      context: context,
      title: l10n.settingsDefaultTaskBoardNavigation,
      description: l10n.settingsDefaultTaskBoardNavigationDescription,
      currentValue: _disableDefaultTaskBoardNavigation,
      options: [
        SettingsChoiceOption(
          value: false,
          label: l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
          icon: Icons.view_kanban_outlined,
        ),
        SettingsChoiceOption(
          value: true,
          label: l10n.settingsDefaultTaskBoardNavigationBoardPicker,
          icon: Icons.dashboard_outlined,
        ),
      ],
    );
    if (selected == null ||
        !mounted ||
        selected == _disableDefaultTaskBoardNavigation) {
      return;
    }
    await _settingsRepository.setDisableDefaultTaskBoardNavigation(
      value: selected,
    );
    if (mounted) setState(() => _disableDefaultTaskBoardNavigation = selected);
  }

  Future<void> _showFinanceAmountsDialog(FinancePreferencesCubit cubit) =>
      openFinanceProductSettings(context, cubit);

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
          icon: Icons.vibration_rounded,
        ),
        SettingsChoiceOption(
          value: false,
          label: l10n.commonOff,
          icon: Icons.notifications_off_outlined,
        ),
      ],
    );
    if (selected != null && mounted && selected != AppHaptics.enabled) {
      await AppHaptics.setEnabled(value: selected);
      if (mounted) setState(() {});
    }
  }

  Future<void> _showCalendarDialog() => openCalendarProductSettings(context);

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
          icon: Icons.settings_suggest_rounded,
          description: l10n.settingsLanguageSystemDescription,
        ),
        SettingsChoiceOption(
          value: 'en',
          label: l10n.settingsLanguageEnglish,
          icon: Icons.translate_rounded,
        ),
        SettingsChoiceOption(
          value: 'vi',
          label: l10n.settingsLanguageVietnamese,
          icon: Icons.translate_rounded,
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
