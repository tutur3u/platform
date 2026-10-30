part of 'settings_page.dart';

/// Device-wide preferences. Per-app settings live under Settings > Apps.
class _PreferencesSection extends StatelessWidget {
  const _PreferencesSection({
    required this.permissionsRepository,
    required this.permissionsRevision,
    required this.appearanceTheme,
    required this.appearanceIsNew,
    required this.languageLabel,
    required this.onChangeLanguage,
    required this.onOpenAppearance,
    required this.hapticsEnabled,
    required this.onToggleHaptics,
    required this.anchors,
  });

  final WorkspacePermissionsRepository permissionsRepository;
  final int permissionsRevision;
  final String appearanceTheme;
  final bool appearanceIsNew;
  final String languageLabel;
  final VoidCallback onChangeLanguage;
  final VoidCallback onOpenAppearance;
  final bool hapticsEnabled;
  final VoidCallback onToggleHaptics;

  /// Quick-jump targets keyed by group id.
  final GlobalKey Function(String id) anchors;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final auth = context.watch<AuthCubit?>();
    final userId = auth == null ? currentCacheUserId() : auth.state.user?.id;
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final personalZone = TimezoneSettingsTile(
      userId: userId,
      workspaceId: workspaceId,
      grouped: true,
    );
    final appearance = SettingsTile(
      key: const ValueKey('settings-appearance-row'),
      grouped: true,
      icon: LucideIcons.palette,
      title: l10n.settingsAppearance,
      trailingValue: appearanceTheme,
      badge: appearanceIsNew ? l10n.appearanceNew : null,
      onTap: onOpenAppearance,
    );
    final language = SettingsTile(
      grouped: true,
      icon: LucideIcons.globe,
      title: l10n.settingsLanguage,
      value: languageLabel,
      onTap: onChangeLanguage,
    );
    final notifications = SettingsTile(
      grouped: true,
      icon: LucideIcons.bellRing,
      title: l10n.remindersTitle,
      onTap: () => context.push(Routes.settingsReminders),
    );
    final interaction = SettingsTile(
      key: const ValueKey('settings-haptics-row'),
      grouped: true,
      icon: LucideIcons.vibrate,
      title: l10n.settingsHaptics,
      value: hapticsEnabled ? l10n.commonOn : l10n.commonOff,
      onTap: onToggleHaptics,
    );
    final workspaceZone = workspaceId == null
        ? null
        : WorkspaceTimezoneSettingsTile(
            userId: userId,
            workspaceId: workspaceId,
            permissionsRepository: permissionsRepository,
            refreshRevision: permissionsRevision,
            grouped: true,
          );
    final groups = [
      ('appearance', l10n.settingsAppearanceLanguage, [appearance, language]),
      (
        'time-zone',
        l10n.settingsTimeZoneGroup,
        [personalZone, if (workspaceZone != null) workspaceZone],
      ),
      (
        'interaction',
        l10n.settingsNotificationsInteraction,
        [notifications, interaction, const LinkBrowserSettingsTile()],
      ),
      ('privacy', l10n.settingsPrivacy, [const TelemetrySettingsTile()]),
    ];
    final sections = [
      for (final group in groups)
        SettingsCompactSection(
          key: anchors(group.$1),
          title: group.$2,
          children: group.$3,
        ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        Widget column(List<Widget> widgets) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var index = 0; index < widgets.length; index++) ...[
              if (index > 0) const SizedBox(height: SettingsRowLayout.groupGap),
              widgets[index],
            ],
          ],
        );
        return constraints.maxWidth >= 840
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: column(sections.take(2).toList())),
                  const SizedBox(width: SettingsRowLayout.groupGap),
                  Expanded(child: column(sections.skip(2).toList())),
                ],
              )
            : column(sections);
      },
    );
  }
}
