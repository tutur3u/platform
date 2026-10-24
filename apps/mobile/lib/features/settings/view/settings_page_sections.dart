part of 'settings_page.dart';

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
          icon: LucideIcons.sparkles,
          title: l10n.settingsWhatsNew,
          subtitle: l10n.settingsWhatsNewDescription,
          onTap: () => context.push(Routes.settingsWhatsNew),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.fileText,
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
          icon: LucideIcons.info,
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
          icon: LucideIcons.shieldUser,
          title: l10n.adminAccountsTitle,
          subtitle: l10n.adminAccountsDescription,
          onTap: () => context.push(Routes.settingsInternalAccounts),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.download,
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
