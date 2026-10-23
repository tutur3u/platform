part of 'profile_page.dart';

class _ProfileHeroCard extends StatelessWidget {
  const _ProfileHeroCard({required this.profile, required this.state});

  final UserProfile profile;
  final ProfileState state;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final displayName = profile.displayName?.trim().isNotEmpty ?? false
        ? profile.displayName!.trim()
        : profile.fullName?.trim().isNotEmpty ?? false
        ? profile.fullName!.trim()
        : profile.email ?? l10n.profileTitle;

    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfileBanner(profile: profile),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LargeProfileAvatar(profile: profile),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(2),
                    Text(
                      profile.email ?? l10n.profileMissingValue,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
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
    );
  }
}

class _LargeProfileAvatar extends StatelessWidget {
  const _LargeProfileAvatar({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final source =
        profile.displayName ?? profile.fullName ?? profile.email ?? '?';
    final initials = source.trim().isEmpty
        ? '?'
        : source.trim()[0].toUpperCase();

    return Container(
      width: 74,
      height: 74,
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(22),
      ),
      alignment: Alignment.center,
      child: profile.avatarUrl?.trim().isNotEmpty ?? false
          ? ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: Image(
                image: profileMediaImage(profile.avatarUrl!, profile.id),
                width: 74,
                height: 74,
                fit: BoxFit.cover,
              ),
            )
          : Text(
              initials,
              style: theme.typography.h2.copyWith(fontWeight: FontWeight.w800),
            ),
    );
  }
}
