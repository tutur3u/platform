part of 'settings_page.dart';

class _SettingsOverviewSection extends StatelessWidget {
  const _SettingsOverviewSection({required this.showInfrastructure});

  final bool showInfrastructure;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final general = SettingsCompactSection(
      title: l10n.settingsGeneralGroup,
      children: [
        SettingsTile(
          key: const ValueKey('settings-workspace-row'),
          grouped: true,
          icon: Icons.workspaces_outline,
          title: l10n.settingsNavWorkspace,
          value:
              context.watch<WorkspaceCubit>().state.currentWorkspace?.name ??
              l10n.settingsNoWorkspaceSelected,
          onTap: () => context.push(Routes.settingsWorkspace),
        ),
        const HiddenWorkspacesSettingsRow(
          key: ValueKey('settings-hidden-workspaces-row'),
          grouped: true,
        ),
        SettingsTile(
          key: const ValueKey('settings-you-row'),
          grouped: true,
          icon: Icons.person_outline_rounded,
          title: l10n.settingsNavYou,
          value: context.watch<AuthCubit?>()?.state.user?.email,
          onTap: () => context.push(Routes.profileRoot),
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
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 16),
          child: OfflinePreparationSection(),
        ),
        if (showInfrastructure)
          SettingsTile(
            grouped: true,
            icon: Icons.dns_outlined,
            title: l10n.settingsInfrastructureSectionTitle,
            onTap: () => context.push(Routes.settingsInfrastructure),
          ),
      ],
    );
    final support = SettingsCompactSection(
      title: l10n.settingsSupportGroup,
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
          icon: Icons.description_outlined,
          title: l10n.settingsLicensesSectionTitle,
          onTap: () => showSettingsLicensePage(context: context),
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
          icon: Icons.description_outlined,
          title: l10n.settingsLicensesSectionTitle,
          subtitle: l10n.settingsLicenseViewerDescription,
          onTap: () => showSettingsLicensePage(
            context: context,
            applicationName: packageInfo?.appName ?? 'Tuturuuu',
            applicationVersion: _formatVersionLabel(packageInfo),
          ),
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
    required this.permissionsRepository,
    required this.permissionsRevision,
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

  final WorkspacePermissionsRepository permissionsRepository;
  final int permissionsRevision;
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

    final auth = context.watch<AuthCubit?>();
    final userId = auth == null ? currentCacheUserId() : auth.state.user?.id;
    final workspaceId = context
        .watch<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final tiles = <Widget>[
      TimezoneSettingsTile(
        userId: userId,
        workspaceId: workspaceId,
        grouped: true,
      ),
      if (workspaceId != null)
        WorkspaceTimezoneSettingsTile(
          userId: userId,
          workspaceId: workspaceId,
          permissionsRepository: permissionsRepository,
          refreshRevision: permissionsRevision,
          grouped: true,
        ),
      SettingsTile(
        grouped: true,
        icon: Icons.palette_outlined,
        title: l10n.settingsTheme,
        value: themeLabel,
        onTap: onChangeTheme,
      ),
      SettingsTile(
        grouped: true,
        icon: Icons.language_rounded,
        title: l10n.settingsLanguage,
        value: languageLabel,
        onTap: onChangeLanguage,
      ),
      SettingsTile(
        key: const ValueKey('settings-finance-row'),
        grouped: true,
        icon: Icons.visibility_outlined,
        title: l10n.settingsFinanceAmounts,
        value: showFinanceAmounts
            ? l10n.financeShowAmounts
            : l10n.financeHideAmounts,
        onTap: onToggleFinanceAmounts,
      ),
      SettingsTile(
        grouped: true,
        icon: Icons.calendar_today_outlined,
        title: l10n.settingsFirstDayOfWeek,
        value: calendarLabel,
        onTap: onChangeFirstDayOfWeek,
      ),
      SettingsTile(
        grouped: true,
        icon: Icons.notifications_active_outlined,
        title: l10n.remindersTitle,
        onTap: () => context.push(Routes.settingsReminders),
      ),
      SettingsTile(
        key: const ValueKey('settings-haptics-row'),
        grouped: true,
        icon: Icons.vibration_rounded,
        title: l10n.settingsHaptics,
        value: hapticsEnabled ? l10n.commonOn : l10n.commonOff,
        onTap: onToggleHaptics,
      ),
      SettingsTile(
        grouped: true,
        icon: Icons.storage_outlined,
        title: l10n.cacheStorageTitle,
        onTap: () => unawaited(showCacheStorageSheet(context)),
      ),
      SettingsTile(
        key: const ValueKey('settings-task-board-row'),
        grouped: true,
        icon: Icons.view_kanban_outlined,
        title: l10n.taskBoardsTitle,
        value: disableDefaultTaskBoardNavigation
            ? l10n.settingsDefaultTaskBoardNavigationBoardPicker
            : l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
        onTap: onToggleDefaultTaskBoardNavigation,
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final split = (tiles.length / 2).ceil();
        return SettingsCompactSection(
          title: l10n.settingsPreferencesSectionTitle,
          columnSplit: constraints.maxWidth >= 840 ? split : null,
          children: tiles,
        );
      },
    );
  }
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
