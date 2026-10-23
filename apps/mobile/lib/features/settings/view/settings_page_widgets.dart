part of 'settings_page.dart';

class _SettingsOverviewSection extends StatelessWidget {
  const _SettingsOverviewSection({
    required this.showInfrastructure,
    required this.anchors,
  });

  final bool showInfrastructure;
  final GlobalKey Function(String id) anchors;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final general = SettingsCompactSection(
      key: anchors('general'),
      title: l10n.settingsGeneralGroup,
      children: [
        SettingsTile(
          key: const ValueKey('settings-workspace-row'),
          grouped: true,
          icon: shad.LucideIcons.building2,
          title: l10n.settingsNavWorkspace,
          value:
              context.select<WorkspaceCubit, String?>(
                (cubit) => cubit.state.currentWorkspace?.name,
              ) ??
              l10n.settingsNoWorkspaceSelected,
          onTap: () => context.push(Routes.settingsWorkspace),
        ),
        const HiddenWorkspacesSettingsRow(
          key: ValueKey('settings-hidden-workspaces-row'),
          grouped: true,
        ),
        // Profile editing is reached from the header's Edit profile.
        SettingsTile(
          key: const ValueKey('settings-accounts-row'),
          grouped: true,
          icon: shad.LucideIcons.userCog,
          title: l10n.authManageAccounts,
          value: context.watch<AuthCubit?>()?.state.user?.email,
          onTap: () => context.push(Routes.settingsAccounts),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.flaskConical,
          title: l10n.settingsExperimentalAppsSectionTitle,
          onTap: () => context.push(Routes.settingsExperiments),
        ),
        SettingsTile(
          key: const ValueKey('settings-offline-row'),
          grouped: true,
          icon: shad.LucideIcons.hardDriveDownload,
          title: l10n.offlineSectionTitle,
          onTap: () => context.push(Routes.settingsOffline),
        ),
        if (showInfrastructure)
          SettingsTile(
            grouped: true,
            icon: shad.LucideIcons.server,
            title: l10n.settingsInfrastructureSectionTitle,
            onTap: () => context.push(Routes.settingsInfrastructure),
          ),
      ],
    );
    final support = SettingsCompactSection(
      key: anchors('support'),
      title: l10n.settingsSupportGroup,
      children: [
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.messageSquareText,
          title: l10n.feedbackTitle,
          onTap: () => context.push(Routes.settingsFeedback),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.sparkles,
          title: l10n.settingsWhatsNew,
          onTap: () => context.push(Routes.settingsWhatsNew),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.compass,
          title: l10n.connectedOnboardingSettingsTitle,
          onTap: () => Navigator.of(context, rootNavigator: true).push(
            MaterialPageRoute<void>(
              builder: (_) => const OnboardingPage(replay: true),
            ),
          ),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.fileText,
          title: l10n.settingsLicensesSectionTitle,
          onTap: () => showSettingsLicensePage(context: context),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.info,
          title: l10n.settingsAboutSectionTitle,
          onTap: () => context.push(Routes.settingsAbout),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.logOut,
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
            children: [
              general,
              const shad.Gap(SettingsRowLayout.groupGap),
              support,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: general),
            const SizedBox(width: SettingsRowLayout.groupGap),
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
      grouped: true,
      children: [
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.sparkles,
          title: l10n.settingsWhatsNew,
          subtitle: l10n.settingsWhatsNewDescription,
          onTap: () => context.push(Routes.settingsWhatsNew),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.fileText,
          title: l10n.settingsLicensesSectionTitle,
          subtitle: l10n.settingsLicenseViewerDescription,
          onTap: () => showSettingsLicensePage(
            context: context,
            applicationName: packageInfo?.appName ?? 'Tuturuuu',
            applicationVersion: _formatVersionLabel(packageInfo),
          ),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.info,
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
      grouped: true,
      children: [
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.shieldUser,
          title: l10n.adminAccountsTitle,
          subtitle: l10n.adminAccountsDescription,
          onTap: () => context.push(Routes.settingsInternalAccounts),
        ),
        SettingsTile(
          grouped: true,
          icon: shad.LucideIcons.download,
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
      grouped: true,
      children: [
        for (final module in AppRegistry.experimentalModules)
          SettingsTile(
            grouped: true,
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
