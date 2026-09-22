part of 'settings_page.dart';

class _SettingsOverviewSection extends StatelessWidget {
  const _SettingsOverviewSection({required this.showInfrastructure});

  final bool showInfrastructure;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: _spacedSettingsTiles([
        Text(
          l10n.settingsGeneralGroup,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        SettingsTile(
          icon: Icons.tune_rounded,
          title: l10n.settingsPreferencesSectionTitle,
          subtitle: l10n.settingsPreferencesSectionDescription,
          onTap: () => context.push(Routes.settingsPreferences),
        ),
        SettingsTile(
          icon: Icons.science_outlined,
          title: l10n.settingsExperimentalAppsSectionTitle,
          subtitle: l10n.settingsExperimentalAppsSectionDescription,
          onTap: () => context.push(Routes.settingsExperiments),
        ),
        if (showInfrastructure)
          SettingsTile(
            icon: Icons.dns_outlined,
            title: l10n.settingsInfrastructureSectionTitle,
            subtitle: l10n.settingsInfrastructureSectionDescription,
            onTap: () => context.push(Routes.settingsInfrastructure),
          ),
        const shad.Gap(8),
        Text(
          l10n.settingsSupportGroup,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        SettingsTile(
          icon: Icons.explore_outlined,
          title: l10n.connectedOnboardingSettingsTitle,
          subtitle: l10n.connectedOnboardingSettingsDescription,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => const OnboardingPage(replay: true),
            ),
          ),
        ),
        SettingsTile(
          icon: Icons.info_outline_rounded,
          title: l10n.settingsAboutSectionTitle,
          subtitle: l10n.settingsAboutSectionDescription,
          onTap: () => context.push(Routes.settingsAbout),
        ),
        SettingsTile(
          icon: Icons.logout_rounded,
          title: l10n.settingsDangerSectionTitle,
          subtitle: l10n.settingsDangerSectionDescription,
          onTap: () => context.push(Routes.settingsSession),
        ),
      ]),
    );
  }
}

class _AboutSection extends StatelessWidget {
  const _AboutSection({required this.packageInfo});

  final PackageInfo? packageInfo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsAboutSectionTitle,
      description: l10n.settingsAboutSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.info_outline_rounded,
          title: l10n.settingsAppVersion,
          value: _formatVersionLabel(packageInfo),
          subtitle: l10n.settingsVersionTileDescription,
          showChevron: false,
        ),
      ],
    );
  }
}

class _InfrastructureSection extends StatelessWidget {
  const _InfrastructureSection();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsInfrastructureSectionTitle,
      description: l10n.settingsInfrastructureSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.admin_panel_settings_outlined,
          title: l10n.adminAccountsTitle,
          subtitle: l10n.adminAccountsDescription,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => const InternalAccountsPage(),
            ),
          ),
        ),
        SettingsTile(
          icon: Icons.system_update_alt_rounded,
          title: l10n.settingsMobileVersions,
          subtitle: l10n.settingsMobileVersionsTileDescription,
          onTap: () => context.push(Routes.settingsMobileVersions),
        ),
      ],
    );
  }
}

class _ExperimentalAppsSection extends StatelessWidget {
  const _ExperimentalAppsSection({
    required this.enabledModuleIds,
    required this.onToggleModule,
  });

  final Set<String> enabledModuleIds;
  final ValueChanged<String> onToggleModule;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsExperimentalAppsSectionTitle,
      description: l10n.settingsExperimentalAppsSectionDescription,
      children: [
        for (final module in AppRegistry.experimentalModules)
          SettingsTile(
            icon: module.icon,
            title: module.label(l10n),
            subtitle: l10n.settingsExperimentalAppsTileDescription(
              module.label(l10n),
            ),
            value: enabledModuleIds.contains(module.id)
                ? l10n.settingsExperimentalAppsEnabled
                : l10n.settingsExperimentalAppsDisabled,
            onTap: () => onToggleModule(module.id),
            showChevron: false,
            trailing: IgnorePointer(
              child: shad.Switch(
                value: enabledModuleIds.contains(module.id),
                onChanged: (_) {},
              ),
            ),
          ),
      ],
    );
  }
}

class _PreferencesSection extends StatelessWidget {
  const _PreferencesSection({
    required this.themeLabel,
    required this.showFinanceAmounts,
    required this.languageLabel,
    required this.calendarLabel,
    required this.disableDefaultTaskBoardNavigation,
    required this.onChangeLanguage,
    required this.onToggleFinanceAmounts,
    required this.onToggleDefaultTaskBoardNavigation,
    required this.onChangeTheme,
    required this.onChangeFirstDayOfWeek,
  });

  final String themeLabel;
  final bool showFinanceAmounts;
  final String languageLabel;
  final String calendarLabel;
  final bool disableDefaultTaskBoardNavigation;
  final VoidCallback onChangeLanguage;
  final VoidCallback onToggleFinanceAmounts;
  final VoidCallback onToggleDefaultTaskBoardNavigation;
  final VoidCallback onChangeTheme;
  final VoidCallback onChangeFirstDayOfWeek;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsPreferencesSectionTitle,
      description: l10n.settingsPreferencesSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.palette_outlined,
          title: l10n.settingsTheme,
          subtitle: l10n.settingsThemeDescription,
          value: themeLabel,
          onTap: onChangeTheme,
        ),
        SettingsTile(
          icon: Icons.language_rounded,
          title: l10n.settingsLanguage,
          subtitle: l10n.settingsLanguageDescription,
          value: languageLabel,
          onTap: onChangeLanguage,
        ),
        SettingsTile(
          icon: Icons.visibility_outlined,
          title: l10n.settingsFinanceAmounts,
          subtitle: l10n.settingsFinanceAmountsDescription,
          value: showFinanceAmounts
              ? l10n.financeShowAmounts
              : l10n.financeHideAmounts,
          onTap: onToggleFinanceAmounts,
          showChevron: false,
          trailing: IgnorePointer(
            child: shad.Switch(value: showFinanceAmounts, onChanged: (_) {}),
          ),
        ),
        SettingsTile(
          icon: Icons.calendar_today_outlined,
          title: l10n.settingsFirstDayOfWeek,
          subtitle: l10n.settingsFirstDayOfWeekDescription,
          value: calendarLabel,
          onTap: onChangeFirstDayOfWeek,
        ),
        SettingsTile(
          icon: Icons.view_kanban_outlined,
          title: l10n.settingsDefaultTaskBoardNavigation,
          subtitle: l10n.settingsDefaultTaskBoardNavigationDescription,
          value: disableDefaultTaskBoardNavigation
              ? l10n.settingsDefaultTaskBoardNavigationBoardPicker
              : l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
          onTap: onToggleDefaultTaskBoardNavigation,
          showChevron: false,
          trailing: IgnorePointer(
            child: shad.Switch(
              value: !disableDefaultTaskBoardNavigation,
              onChanged: (_) {},
            ),
          ),
        ),
      ],
    );
  }
}

class _SettingsHeroCard extends StatelessWidget {
  const _SettingsHeroCard({required this.isRefreshing});

  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: 'calendar',
    );
    final l10n = context.l10n;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [
            palette.background,
            theme.colorScheme.card,
            palette.iconBackground,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: palette.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: theme.colorScheme.background.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: theme.colorScheme.border.withValues(alpha: 0.72),
                  ),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.tune_rounded,
                  size: 22,
                  color: theme.colorScheme.primary,
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.settingsTitle,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      l10n.settingsHeroDescription,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
              if (isRefreshing)
                const SizedBox.square(
                  dimension: 16,
                  child: NovaLoadingIndicator(size: 20),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

List<Widget> _spacedSettingsTiles(List<Widget> children) {
  if (children.isEmpty) {
    return const [];
  }

  final widgets = <Widget>[];
  for (var index = 0; index < children.length; index++) {
    if (index > 0) {
      widgets.add(const shad.Gap(12));
    }
    widgets.add(children[index]);
  }
  return widgets;
}

String _formatVersionLabel(PackageInfo? packageInfo) {
  if (packageInfo == null) {
    return '...';
  }

  final buildNumber = packageInfo.buildNumber.trim();
  if (buildNumber.isEmpty) {
    return packageInfo.version;
  }

  return '${packageInfo.version} ($buildNumber)';
}
