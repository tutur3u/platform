import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/profile_media_image.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/profile/view/profile_banner.dart';
import 'package:mobile/l10n/l10n.dart';

/// The account's identity at the top of Profile: cover, avatar, name, email,
/// bio and the way into the profile editor.
///
/// The shell navbar carries the page title, so the name is content, not a
/// second title bar. Identity from a previous account is never shown: the
/// caller passes a null [profile] until the signed-in user's own loads.
class ProfileIdentityCard extends StatelessWidget {
  const ProfileIdentityCard({
    required this.profile,
    required this.avatarUrl,
    required this.userId,
    required this.loading,
    super.key,
  });

  final UserProfile? profile;
  final String? avatarUrl;
  final String? userId;

  /// True while the profile is unknown and has not failed to load.
  final bool loading;

  static const double _avatarSize = 80;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final profile = this.profile;
    final name = profile?.displayName ?? profile?.fullName ?? l10n.profileTitle;
    final email = profile?.email;
    final bio = profile?.bio?.trim();
    final solid = MediaQuery.highContrastOf(context);
    final radius = BorderRadius.circular(AppRadius.card);
    final hasBanner = profile?.bannerUrl?.isNotEmpty ?? false;

    return DecoratedBox(
      key: const ValueKey('profile-overview-content'),
      decoration: BoxDecoration(
        color: c.card.withValues(alpha: solid ? 1 : 0.86),
        borderRadius: radius,
        border: Border.all(color: c.border.withValues(alpha: solid ? 1 : 0.7)),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: _avatarSize / 2),
                  child: hasBanner
                      ? ProfileBanner(
                          profile: profile!,
                          radius: 0,
                          padding: EdgeInsets.zero,
                        )
                      : _CoverTint(color: c.primary),
                ),
                PositionedDirectional(
                  start: AppSpacing.lg,
                  bottom: 0,
                  child: _Avatar(
                    url: avatarUrl,
                    userId: userId,
                    loading: loading,
                    size: _avatarSize,
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.lg,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (loading)
                    _SkeletonLine(width: 160, height: 22, color: c.muted)
                  else
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.x2Large.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w700,
                        height: 1.2,
                        letterSpacing: -0.3,
                      ),
                    ),
                  if (email != null && email.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.small.copyWith(
                        color: c.mutedForeground,
                      ),
                    ),
                  ],
                  if (bio != null && bio.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      bio,
                      style: tokens.typography.small.copyWith(
                        color: c.foreground,
                        height: 1.45,
                      ),
                    ),
                  ],
                  if (profile != null) ...[
                    const SizedBox(height: AppSpacing.lg),
                    AppButton.outline(
                      key: const ValueKey('profile-edit-identity'),
                      size: AppButtonSize.small,
                      leading: const Icon(LucideIcons.userPen),
                      onPressed: () => context.push(Routes.settingsProfile),
                      child: Text(l10n.settingsProfileEdit),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Soft accent wash used when the account has no cover image.
class _CoverTint extends StatelessWidget {
  const _CoverTint({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    final dark = AppTokens.of(context).isDark;
    return AspectRatio(
      aspectRatio: 4,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              color.withValues(alpha: dark ? 0.32 : 0.18),
              color.withValues(alpha: dark ? 0.12 : 0.05),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.url,
    required this.userId,
    required this.loading,
    required this.size,
  });

  final String? url;
  final String? userId;
  final bool loading;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final radius = BorderRadius.circular(size * 0.3);
    Widget fallback() => ColoredBox(
      color: c.muted,
      child: Icon(
        LucideIcons.user,
        size: size * 0.45,
        color: c.mutedForeground,
      ),
    );
    final url = this.url;
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.card, borderRadius: radius),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.3 - 3),
        child: loading
            ? ColoredBox(color: c.muted)
            : url == null
            ? fallback()
            : Image(
                image: profileMediaImage(url, userId ?? ''),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => fallback(),
              ),
      ),
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({
    required this.width,
    required this.height,
    required this.color,
  });

  final double width;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(AppRadius.pill),
    ),
  );
}
