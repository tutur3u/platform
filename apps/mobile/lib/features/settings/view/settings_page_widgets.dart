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
          icon: LucideIcons.building2,
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
        // Profile and account management live under the header's Edit profile.
        SettingsTile(
          grouped: true,
          icon: LucideIcons.flaskConical,
          title: l10n.settingsExperimentalAppsSectionTitle,
          onTap: () => context.push(Routes.settingsExperiments),
        ),
        SettingsTile(
          key: const ValueKey('settings-offline-row'),
          grouped: true,
          icon: LucideIcons.hardDriveDownload,
          title: l10n.offlineSectionTitle,
          onTap: () => context.push(Routes.settingsOffline),
        ),
        if (showInfrastructure)
          SettingsTile(
            grouped: true,
            icon: LucideIcons.server,
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
          icon: LucideIcons.messageSquareText,
          title: l10n.feedbackTitle,
          onTap: () => context.push(Routes.settingsFeedback),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.sparkles,
          title: l10n.settingsWhatsNew,
          onTap: () => context.push(Routes.settingsWhatsNew),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.compass,
          title: l10n.connectedOnboardingSettingsTitle,
          onTap: () => Navigator.of(context, rootNavigator: true).push(
            MaterialPageRoute<void>(
              builder: (_) => const OnboardingPage(replay: true),
            ),
          ),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.fileText,
          title: l10n.settingsLicensesSectionTitle,
          onTap: () => showSettingsLicensePage(context: context),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.info,
          title: l10n.settingsAboutSectionTitle,
          onTap: () => context.push(Routes.settingsAbout),
        ),
        SettingsTile(
          grouped: true,
          icon: LucideIcons.logOut,
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
              const AppGap(SettingsRowLayout.groupGap),
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
