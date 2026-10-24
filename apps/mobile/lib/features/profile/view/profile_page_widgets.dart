part of 'profile_page.dart';

class _ProfileHeroCard extends StatelessWidget {
  const _ProfileHeroCard({required this.profile, required this.state});

  final UserProfile profile;
  final ProfileState state;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final l10n = context.l10n;
    final displayName = profile.displayName?.trim().isNotEmpty ?? false
        ? profile.displayName!.trim()
        : profile.fullName?.trim().isNotEmpty ?? false
        ? profile.fullName!.trim()
        : profile.email ?? l10n.profileTitle;

    final hasBanner = profile.bannerUrl?.isNotEmpty ?? false;
    // A borderless card on the grouped fill, like the Settings header.
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SettingsRowLayout.groupFill(context),
        borderRadius: BorderRadius.circular(SettingsRowLayout.cardRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(SettingsRowLayout.inset),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasBanner) ProfileBanner(profile: profile),
            Row(
              children: [
                _LargeProfileAvatar(profile: profile),
                const AppGap(16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const AppGap(2),
                      Text(
                        profile.email ?? l10n.profileMissingValue,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.base.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
                if (state.isRefreshing)
                  const SizedBox.square(
                    dimension: 18,
                    child: NovaLoadingIndicator(size: 20),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LargeProfileAvatar extends StatelessWidget {
  const _LargeProfileAvatar({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final source =
        profile.displayName ?? profile.fullName ?? profile.email ?? '?';
    final initials = source.trim().isEmpty
        ? '?'
        : source.trim()[0].toUpperCase();

    // Circular, at the Settings header's size.
    return ClipOval(
      child: SizedBox.square(
        dimension: 64,
        child: profile.avatarUrl?.trim().isNotEmpty ?? false
            ? Image(
                image: profileMediaImage(profile.avatarUrl!, profile.id),
                fit: BoxFit.cover,
              )
            : ColoredBox(
                color: theme.colorScheme.muted,
                child: Center(
                  child: Text(
                    initials,
                    style: theme.typography.xLarge.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
