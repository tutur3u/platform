import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the Edit profile button.
const profileEditIdentityKey = ValueKey<String>('profile-edit-identity');

/// Who is signed in: avatar, name, email and bio, with Edit profile. The
/// banner is edited in Edit profile and not shown here.
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
    super.key,
  });

  static const double avatarSize = 56;

  final UserProfile? profile;
  final bool loading;

  /// The session's email while the profile is unavailable.
  final String? fallbackEmail;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final email = profile?.email ?? fallbackEmail;
    final bio = switch (profile?.bio?.trim()) {
      final text? when text.isNotEmpty => text,
      _ => null,
    };
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
              _Avatar(
                url: normalizeAvatarUrl(avatarUrl),
                actorId: profile?.id ?? '',
                name: name,
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
                        if (bio != null) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            bio,
                            key: const ValueKey('profile-identity-bio'),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySm.copyWith(color: c.foreground),
                          ),
                        ],
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

/// The signed-in avatar. Signed or private URLs are never disk-cached, so the
/// image goes through [profileMediaImage]; initials stand in when it fails.
class _Avatar extends StatelessWidget {
  const _Avatar({required this.url, required this.actorId, required this.name});

  final String? url;
  final String actorId;
  final String name;

  @override
  Widget build(BuildContext context) {
    const size = ProfileIdentityHeader.avatarSize;
    Widget fallback() =>
        SettingsProfileAvatar(url: null, name: name, size: size);
    final url = this.url;
    if (url == null) return fallback();
    return ClipOval(
      key: const ValueKey('profile-identity-avatar'),
      child: Image(
        image: profileMediaImage(url, actorId),
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback(),
      ),
    );
  }
}
