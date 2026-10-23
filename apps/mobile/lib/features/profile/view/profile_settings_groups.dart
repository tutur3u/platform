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
    final cubit = context.read<ProfileCubit>();
    final pendingEmail = profile.newEmail?.trim() ?? '';
    final identity = PendingSyncFrame(
      workspaceId: 'personal',
      feature: 'profile',
      entityId: profile.id,
      child: SettingsCompactSection(
        title: l10n.profileIdentitySectionTitle,
        children: [
          SettingsTile(
            key: const ValueKey('profile-display-name-row'),
            grouped: true,
            icon: Icons.person_outline_rounded,
            title: l10n.profileDisplayName,
            value: profile.displayName ?? l10n.profileMissingValue,
            onTap: () => editField(
              context,
              title: l10n.profileDisplayName,
              description: l10n.profileDisplayNameDescription,
              initialValue: profile.displayName ?? '',
              placeholder: l10n.profileDisplayNameHint,
              validator: (value) =>
                  value.trim().isEmpty ? l10n.profileDisplayNameRequired : null,
              onSave: cubit.updateDisplayName,
            ),
          ),
          SettingsTile(
            key: const ValueKey('profile-full-name-row'),
            grouped: true,
            icon: Icons.badge_outlined,
            title: l10n.profileFullName,
            value: profile.fullName ?? l10n.profileMissingValue,
            onTap: () => editField(
              context,
              title: l10n.profileFullName,
              description: l10n.profileFullNameDescription,
              initialValue: profile.fullName ?? '',
              placeholder: l10n.profileFullNameHint,
              validator: (value) =>
                  value.trim().isEmpty ? l10n.profileFullNameRequired : null,
              onSave: cubit.updateFullName,
            ),
          ),
          SettingsTile(
            key: const ValueKey('profile-email-row'),
            grouped: true,
            wrapSupportingText: true,
            icon: Icons.alternate_email_rounded,
            title: l10n.profileEmail,
            value: profile.email ?? l10n.profileMissingValue,
            subtitle: pendingEmail.isEmpty
                ? null
                : l10n.profileEmailPendingChange(pendingEmail),
            onTap: () => editField(
              context,
              title: l10n.profileEmail,
              description: l10n.profileEmailDescription,
              initialValue: profile.email ?? '',
              placeholder: l10n.profileEmailHint,
              keyboardType: TextInputType.emailAddress,
              validator: (value) =>
                  value.contains('@') ? null : l10n.profileInvalidEmail,
              onSave: cubit.updateEmail,
              successMessage: l10n.profileEmailUpdateNote,
            ),
          ),
        ],
      ),
    );
    final hasAvatar = profile.avatarUrl?.trim().isNotEmpty ?? false;
    final photos = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SettingsCompactSection(
          title: l10n.profileAvatarSectionTitle,
          children: [
            SettingsTile(
              key: const ValueKey('profile-avatar-row'),
              grouped: true,
              icon: Icons.photo_camera_back_outlined,
              title: profile.avatarUrl != null
                  ? l10n.profileChangeAvatar
                  : l10n.profileUploadAvatar,
              value: hasAvatar
                  ? l10n.profileAvatarSet
                  : l10n.profileMissingValue,
              onTap: () =>
                  pickAndUploadProfileAvatar(context, picker: avatarPicker),
            ),
            if (profile.avatarUrl != null)
              SettingsTile(
                key: const ValueKey('profile-avatar-remove-row'),
                grouped: true,
                isDestructive: true,
                icon: Icons.delete_outline_rounded,
                title: l10n.profileRemoveAvatar,
                onTap: () => confirmRemoveProfileAvatar(context),
              ),
          ],
        ),
        const shad.Gap(SettingsRowLayout.groupGap),
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
          icon: Icons.manage_accounts_outlined,
          title: l10n.authManageAccounts,
          onTap: () => context.push(Routes.settingsAccounts),
        ),
        SettingsTile(
          key: const ValueKey('profile-sessions-row'),
          grouped: true,
          icon: Icons.devices_outlined,
          title: l10n.securitySessionsTitle,
          onTap: () => context.push(Routes.settingsAccountSecurity),
        ),
      ],
    );
    final joined = profile.createdAt == null
        ? l10n.profileStatusUnknown
        : DateFormat.yMMMd(
            Localizations.localeOf(context).toString(),
          ).format(profile.createdAt!);
    final status = SettingsCompactSection(
      title: l10n.profileAccountStatus,
      children: [
        for (final (icon, label, value) in [
          (
            Icons.verified_user_outlined,
            l10n.profileStatus,
            l10n.profileActive,
          ),
          (
            Icons.verified_outlined,
            l10n.profileVerification,
            l10n.profileVerified,
          ),
          (Icons.event_outlined, l10n.profileMemberSince, joined),
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
        child: identity,
      ),
      StaggeredEntry(index: 2, playOnceKey: 'profile-avatar', child: photos),
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
