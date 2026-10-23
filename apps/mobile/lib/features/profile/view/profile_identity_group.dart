part of 'profile_page.dart';

/// Display name, full name and email, each edited in its own sheet.
class _ProfileIdentityGroup extends StatelessWidget {
  const _ProfileIdentityGroup({required this.profile, required this.editField});

  final UserProfile profile;
  final _EditProfileField editField;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<ProfileCubit>();
    final pendingEmail = profile.newEmail?.trim() ?? '';
    return PendingSyncFrame(
      workspaceId: 'personal',
      feature: 'profile',
      entityId: profile.id,
      child: SettingsCompactSection(
        title: l10n.profileIdentitySectionTitle,
        children: [
          SettingsTile(
            key: const ValueKey('profile-display-name-row'),
            grouped: true,
            icon: shad.LucideIcons.userRound,
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
            icon: shad.LucideIcons.idCard,
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
            icon: shad.LucideIcons.atSign,
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
  }
}
