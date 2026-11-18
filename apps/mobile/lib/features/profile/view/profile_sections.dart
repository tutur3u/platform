import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/profile/view/profile_link_row.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/settings/view/settings_delete_account_row.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/shell/view/account_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Switch account: the other saved accounts' avatars and the most recent
/// one's email. It opens the account switcher, which also adds and manages
/// accounts.
class ProfileAccountSwitchRow extends StatelessWidget {
  const ProfileAccountSwitchRow({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // The two most recent other accounts: a stable
    // value, so unrelated auth changes do not rebuild the row.
    final (first, second) = context
        .select<AuthCubit, (StoredAuthAccount?, StoredAuthAccount?)>((cubit) {
          final others = sortStoredAccountsByRecent(
            cubit.state.accounts.where(
              (account) => account.id != cubit.state.activeAccountId,
            ),
          );
          return (others.firstOrNull, others.elementAtOrNull(1));
        });
    final surface = AppTokens.of(context).colorScheme.card;
    // Two overlapping avatars fit the row's 40dp leading slot.
    const avatarSize = 26.0;
    const ring = 2.0;
    Widget avatar(StoredAuthAccount account) => DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: surface, width: ring),
      ),
      child: SettingsProfileAvatar(
        url: account.avatarUrl,
        name: accountPrimaryLabel(account),
        size: avatarSize,
      ),
    );
    final shown = [?first, ?second];
    return ProfileLinkRow(
      key: const ValueKey('profile-switch-account'),
      title: l10n.authSwitchAccount,
      subtitle: first == null
          ? l10n.profileAddAnotherAccount
          : first.email ?? accountPrimaryLabel(first),
      icon: LucideIcons.users,
      tone: AppTone.primary,
      leading: shown.isEmpty
          ? null
          : SizedBox(
              width: ProfileLinkRow.tileSize,
              height: ProfileLinkRow.tileSize,
              child: Stack(
                alignment: AlignmentDirectional.centerStart,
                children: [
                  for (final (index, account) in shown.indexed)
                    PositionedDirectional(
                      start: shown.length == 1
                          ? (ProfileLinkRow.tileSize - avatarSize) / 2 - ring
                          : index *
                                (ProfileLinkRow.tileSize -
                                    avatarSize -
                                    2 * ring),
                      child: avatar(account),
                    ),
                ],
              ),
            ),
      showChevron: false,
      trailing: const Icon(LucideIcons.chevronsUpDown),
      onTap: () => unawaited(showProfileAccountSwitcher(context)),
    );
  }
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
