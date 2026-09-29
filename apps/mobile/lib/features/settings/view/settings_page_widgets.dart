part of 'settings_page.dart';

class _SettingsOverviewSection extends StatelessWidget {
  const _SettingsOverviewSection({required this.showInfrastructure});

  final bool showInfrastructure;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final general = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.settingsGeneralGroup,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const shad.Gap(8),
        SettingsGroup(
          children: [
            SettingsTile(
              grouped: true,
              icon: Icons.tune_rounded,
              title: l10n.settingsPreferencesSectionTitle,
              onTap: () => context.push(Routes.settingsPreferences),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.science_outlined,
              title: l10n.settingsExperimentalAppsSectionTitle,
              onTap: () => context.push(Routes.settingsExperiments),
            ),
            ValueListenableBuilder(
              valueListenable: OfflineMutationQueue.instance.pending,
              builder: (context, records, _) => SettingsTile(
                grouped: true,
                icon: Icons.sync_rounded,
                title: l10n.offlineChangesTitle,
                value: records.isEmpty ? null : '${records.length}',
                onTap: () => unawaited(showOfflineChangesSheet(context)),
              ),
            ),
            if (showInfrastructure)
              SettingsTile(
                grouped: true,
                icon: Icons.dns_outlined,
                title: l10n.settingsInfrastructureSectionTitle,
                onTap: () => context.push(Routes.settingsInfrastructure),
              ),
          ],
        ),
      ],
    );
    final support = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.settingsSupportGroup,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const shad.Gap(8),
        SettingsGroup(
          children: [
            SettingsTile(
              grouped: true,
              icon: Icons.auto_awesome_outlined,
              title: l10n.settingsWhatsNew,
              onTap: () => context.push(Routes.settingsWhatsNew),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.explore_outlined,
              title: l10n.connectedOnboardingSettingsTitle,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const OnboardingPage(replay: true),
                ),
              ),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.info_outline_rounded,
              title: l10n.settingsAboutSectionTitle,
              onTap: () => context.push(Routes.settingsAbout),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.logout_rounded,
              title: l10n.settingsDangerSectionTitle,
              onTap: () => context.push(Routes.settingsSession),
            ),
          ],
        ),
      ],
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 840) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [general, const shad.Gap(20), support],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: general),
            const SizedBox(width: 20),
            Expanded(child: support),
          ],
        );
      },
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
      title: '',
      children: [
        SettingsTile(
          icon: Icons.auto_awesome_outlined,
          title: l10n.settingsWhatsNew,
          subtitle: l10n.settingsWhatsNewDescription,
          onTap: () => context.push(Routes.settingsWhatsNew),
        ),
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
      title: '',
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
      title: '',
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
    required this.hapticsEnabled,
    required this.onToggleHaptics,
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
  final bool hapticsEnabled;
  final VoidCallback onToggleHaptics;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final tiles = <Widget>[
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
        icon: Icons.notifications_active_outlined,
        title: l10n.remindersTitle,
        subtitle: l10n.remindersDescription,
        onTap: () => context.push(Routes.settingsReminders),
      ),
      SettingsTile(
        icon: Icons.vibration_rounded,
        title: l10n.settingsHaptics,
        value: hapticsEnabled ? l10n.commonOn : l10n.commonOff,
        onTap: onToggleHaptics,
        showChevron: false,
        trailing: IgnorePointer(
          child: shad.Switch(value: hapticsEnabled, onChanged: (_) {}),
        ),
      ),
      SettingsTile(
        icon: Icons.storage_outlined,
        title: l10n.cacheStorageTitle,
        subtitle: l10n.cacheStorageDescription,
        onTap: () => unawaited(showCacheStorageSheet(context)),
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
    ];
    return LayoutBuilder(
      builder: (context, constraints) => SettingsSection(
        title: '',
        children: constraints.maxWidth < 840
            ? tiles
            : [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _settingsTileColumn(tiles.take(3).toList()),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: _settingsTileColumn(tiles.skip(3).toList()),
                    ),
                  ],
                ),
              ],
      ),
    );
  }
}

Widget _settingsTileColumn(List<Widget> tiles) => Column(
  children: [
    for (var index = 0; index < tiles.length; index++) ...[
      if (index > 0) const shad.Gap(8),
      tiles[index],
    ],
  ],
);

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
