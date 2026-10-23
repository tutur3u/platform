part of 'profile_page.dart';

typedef _EditProfileField =
    Future<void> Function(
      BuildContext context, {
      required String title,
      required String description,
      required String initialValue,
      required String placeholder,
      required Future<bool> Function(String value) onSave,
      required String? Function(String value) validator,
      TextInputType? keyboardType,
      String? successMessage,
    });

/// Every account and profile setting, reached from Settings > Edit profile,
/// in the same captioned grouped cards as the rest of Settings.
class _ProfileSettingsGroups extends StatelessWidget {
  const _ProfileSettingsGroups({
    required this.profile,
    required this.editField,
    required this.avatarPicker,
    required this.busy,
  });

  final UserProfile profile;
  final _EditProfileField editField;
  final ProfileAvatarPicker avatarPicker;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasAvatar = profile.avatarUrl?.trim().isNotEmpty ?? false;
    final media = SettingsCompactSection(
      title: l10n.profileAvatarSectionTitle,
      children: [
        SettingsTile(
          key: const ValueKey('profile-avatar-row'),
          grouped: true,
          icon: shad.LucideIcons.imageUp,
          title: l10n.profilePhoto,
          value: hasAvatar ? l10n.profileMediaSet : l10n.profileMissingValue,
          onTap: () =>
              pickAndUploadProfileAvatar(context, picker: avatarPicker),
        ),
        if (profile.avatarUrl != null)
          SettingsTile(
            key: const ValueKey('profile-avatar-remove-row'),
            grouped: true,
            isDestructive: true,
            icon: shad.LucideIcons.trash2,
            title: l10n.profileRemoveAvatar,
            onTap: () => confirmRemoveProfileAvatar(context),
          ),
        PendingSyncFrame(
          workspaceId: 'personal',
          feature: 'profile',
          entityId: profile.id,
          child: ProfileBannerSettings(profile: profile, busy: busy),
        ),
      ],
    );
    final account = SettingsCompactSection(
      title: l10n.settingsAccountSectionTitle,
      children: [
        SettingsTile(
          key: const ValueKey('profile-accounts-row'),
          grouped: true,
          icon: shad.LucideIcons.userCog,
          title: l10n.authManageAccounts,
          value: profile.email,
          onTap: () => context.push(Routes.settingsAccounts),
        ),
        SettingsTile(
          key: const ValueKey('profile-sessions-row'),
          grouped: true,
          icon: shad.LucideIcons.monitorSmartphone,
          title: l10n.securitySessionsTitle,
          onTap: () => context.push(Routes.settingsAccountSecurity),
        ),
      ],
    );
    final joined = profile.createdAt;
    final status = SettingsCompactSection(
      title: l10n.profileAccountStatus,
      children: [
        for (final (icon, label, value) in [
          (
            shad.LucideIcons.shieldCheck,
            l10n.profileStatus,
            l10n.profileActive,
          ),
          (
            shad.LucideIcons.badgeCheck,
            l10n.profileVerification,
            l10n.profileVerified,
          ),
          // An unknown join date is omitted rather than shown as "Unknown".
          if (joined != null)
            (
              shad.LucideIcons.calendarDays,
              l10n.profileMemberSince,
              DateFormat.yMMMd(
                Localizations.localeOf(context).toString(),
              ).format(joined),
            ),
        ])
          SettingsTile(
            grouped: true,
            showChevron: false,
            icon: icon,
            title: label,
            value: value,
          ),
      ],
    );
    final groups = [
      StaggeredEntry(
        index: 1,
        playOnceKey: 'profile-identity',
        child: _ProfileIdentityGroup(profile: profile, editField: editField),
      ),
      StaggeredEntry(index: 2, playOnceKey: 'profile-avatar', child: media),
      StaggeredEntry(index: 3, playOnceKey: 'profile-account', child: account),
      StaggeredEntry(index: 4, playOnceKey: 'profile-status', child: status),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        Widget column(Iterable<Widget> widgets) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (index, widget) in widgets.indexed) ...[
              if (index > 0) const shad.Gap(SettingsRowLayout.groupGap),
              widget,
            ],
          ],
        );
        if (constraints.maxWidth < 840) return column(groups);
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: column(groups.take(2))),
            const shad.Gap(SettingsRowLayout.groupGap),
            Expanded(child: column(groups.skip(2))),
          ],
        );
      },
    );
  }
}
