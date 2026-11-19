import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/profile/view/profile_link_row.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/settings/view/settings_delete_account_row.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens account switching from the signed-in account's profile.
class ProfileAccountSwitchRow extends StatelessWidget {
  const ProfileAccountSwitchRow({this.profile, this.avatarUrl, super.key});

  final UserProfile? profile;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (actorId, email, name, imageUrl) = context
        .select<AuthCubit, (String?, String?, String?, String?)>((cubit) {
          final user = cubit.state.user;
          final saved = cubit.state.accounts
              .where((account) => account.id == user?.id)
              .firstOrNull;
          final metadata = user?.userMetadata;
          return (
            user?.id,
            user?.email ?? saved?.email,
            saved?.displayName ??
                _metadataString(metadata?['display_name']) ??
                _metadataString(metadata?['full_name']),
            saved?.avatarUrl ?? _metadataString(metadata?['avatar_url']),
          );
        });
    final currentProfile = actorId != null && profile?.id == actorId
        ? profile
        : null;
    final currentEmail = currentProfile?.email ?? email;
    final currentName =
        [
              currentProfile?.displayName,
              currentProfile?.fullName,
              name,
              currentEmail,
            ]
            .whereType<String>()
            .map((value) => value.trim())
            .firstWhere(
              (value) => value.isNotEmpty,
              orElse: () => l10n.profileTitle,
            );
    final image = currentProfile == null ? imageUrl : avatarUrl ?? imageUrl;
    const size = ProfileLinkRow.tileSize;
    final fallback = SettingsProfileAvatar(
      url: null,
      name: currentName,
      size: size,
    );
    return ProfileLinkRow(
      key: const ValueKey('profile-switch-account'),
      title: l10n.authSwitchAccount,
      subtitle: currentEmail ?? (actorId == null ? null : currentName),
      icon: LucideIcons.users,
      tone: AppTone.primary,
      leading: actorId == null
          ? null
          : image == null
          ? fallback
          : ClipOval(
              child: Image(
                image: profileMediaImage(image, actorId),
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => fallback,
              ),
            ),
      showChevron: false,
      trailing: const Icon(LucideIcons.chevronsUpDown),
      onTap: () => unawaited(showProfileAccountSwitcher(context)),
    );
  }

  static String? _metadataString(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;
}

/// Shortcuts to the settings people reach for from their profile.
class ProfileLinkGroups extends StatelessWidget {
  const ProfileLinkGroups({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    ProfileLinkRow link(
      String id,
      IconData icon,
      AppTone tone,
      String title,
      String route,
    ) => ProfileLinkRow(
      key: ValueKey('profile-link-$id'),
      icon: icon,
      tone: tone,
      title: title,
      onTap: () => context.push(route),
    );
    Widget card(List<Widget> rows) =>
        ProfileCard(dividerInset: ProfileLinkRow.dividerInset, children: rows);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        card([
          link(
            'settings',
            LucideIcons.settings,
            AppTone.neutral,
            l10n.navSettings,
            Routes.settings,
          ),
          link(
            'appearance',
            LucideIcons.palette,
            AppTone.primary,
            l10n.settingsAppearance,
            Routes.settingsAppearance,
          ),
          link(
            'notifications',
            LucideIcons.bell,
            AppTone.warning,
            l10n.profileNotifications,
            Routes.settingsReminders,
          ),
        ]),
        const SizedBox(height: AppLayout.itemGap),
        card([
          link(
            'security',
            LucideIcons.shieldCheck,
            AppTone.success,
            l10n.profileSecurityDevices,
            Routes.settingsSession,
          ),
        ]),
        const SizedBox(height: AppLayout.itemGap),
        card([
          link(
            'help',
            LucideIcons.lifeBuoy,
            AppTone.info,
            l10n.profileHelpFeedback,
            Routes.settingsFeedback,
          ),
          link(
            'about',
            LucideIcons.info,
            AppTone.neutral,
            l10n.profileAbout,
            Routes.settingsAbout,
          ),
        ]),
      ],
    );
  }
}

/// Sign out, confirmed in a dialog, and Delete account, which opens the
/// public deletion page in the in-app browser like the Settings row.
class ProfileDangerGroup extends StatelessWidget {
  const ProfileDangerGroup({this.launch, super.key});

  /// Test seam for the platform launcher.
  final MobileLinkLaunch? launch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ProfileCard(
      dividerInset: ProfileLinkRow.dividerInset,
      children: [
        ProfileLinkRow(
          key: const ValueKey('profile-sign-out'),
          icon: LucideIcons.logOut,
          title: l10n.settingsSignOut,
          destructive: true,
          showChevron: false,
          onTap: () => unawaited(confirmProfileSignOut(context)),
        ),
        ProfileLinkRow(
          key: const ValueKey('profile-delete-account'),
          icon: LucideIcons.trash2,
          title: l10n.settingsDeleteAccount,
          destructive: true,
          showChevron: false,
          onTap: () => unawaited(
            openMobileLink(
              context,
              accountDeletionUri,
              launch: launch,
              readPreference: () async => LinkBrowserPreference.builtIn,
            ),
          ),
        ),
      ],
    );
  }
}
