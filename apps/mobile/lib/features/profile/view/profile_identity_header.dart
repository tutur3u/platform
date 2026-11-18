import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the Edit profile button.
const profileEditIdentityKey = ValueKey<String>('profile-edit-identity');

/// Who is signed in: avatar, name and email, with Edit profile.
///
/// Identity from a previous account is never shown: the caller passes a null
/// [profile] until the signed-in user's own loads, and [loading] while it is
/// unknown and has not failed.
class ProfileIdentityHeader extends StatelessWidget {
  const ProfileIdentityHeader({
    required this.profile,
    required this.loading,
    this.fallbackEmail,
    this.avatarUrl,
    this.avatarKey,
    super.key,
  });

  static const double avatarSize = 56;

  final UserProfile? profile;
  final bool loading;

  /// The session's email while the profile is unavailable.
  final String? fallbackEmail;
  final String? avatarUrl;
  final String? avatarKey;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final email = profile?.email ?? fallbackEmail;
    final name =
        [profile?.displayName, profile?.fullName, email?.split('@').first]
            .map((value) => value?.trim() ?? '')
            .firstWhere(
              (value) => value.isNotEmpty,
              orElse: () => l10n.profileTitle,
            );
    Widget bar(double width, double height) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
    );
    return DecoratedBox(
      key: const ValueKey('profile-identity'),
      decoration: profileCardDecoration(context),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(
          AppSpacing.md + 2,
          AppSpacing.md + 2,
          AppSpacing.xs,
          AppSpacing.md + 2,
        ),
        child: Row(
          children: [
            if (loading)
              Container(
                width: avatarSize,
                height: avatarSize,
                decoration: BoxDecoration(
                  color: c.muted,
                  shape: BoxShape.circle,
                ),
              )
            else
              SettingsProfileAvatar(
                url: normalizeAvatarUrl(avatarUrl),
                cacheKey: avatarKey,
                name: name,
                size: avatarSize,
              ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: loading
                  ? Semantics(
                      label: l10n.commonLoading,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          bar(140, 18),
                          const SizedBox(height: AppSpacing.sm),
                          bar(180, 12),
                        ],
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.heading.copyWith(
                            color: c.foreground,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (email != null && email != name)
                          Text(
                            email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySm.copyWith(
                              color: c.mutedForeground,
                            ),
                          ),
                      ],
                    ),
            ),
            AppIconButton(
              key: profileEditIdentityKey,
              tooltip: l10n.settingsProfileEdit,
              onPressed: () => context.push(Routes.settingsProfile),
              icon: const Icon(LucideIcons.pencil),
            ),
          ],
        ),
      ),
    );
  }
}
