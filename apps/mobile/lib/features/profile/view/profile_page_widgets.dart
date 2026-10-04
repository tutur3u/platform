part of 'profile_page.dart';

class _ProfileActionTile extends StatelessWidget {
  const _ProfileActionTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
    this.isDestructive = false,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String value;
  final String? subtitle;
  final VoidCallback onTap;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) => SettingsTile(
    icon: icon,
    title: title,
    value: value,
    subtitle: subtitle,
    onTap: onTap,
    isDestructive: isDestructive,
    wrapSupportingText: true,
  );
}

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
              child: Image.network(
                profile.avatarUrl!,
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

class _ProfilePanel extends StatelessWidget {
  const _ProfilePanel({
    required this.title,
    required this.description,
    required this.child,
  });

  final String title;
  final String description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
        ),
        const shad.Gap(6),
        Text(
          description,
          style: theme.typography.textSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(14),
        child,
      ],
    );
  }
}

class _ProfileStatusGrid extends StatelessWidget {
  const _ProfileStatusGrid({required this.profile});

  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final joined = profile.createdAt == null
        ? context.l10n.profileStatusUnknown
        : DateFormat.yMMMd(
            Localizations.localeOf(context).toString(),
          ).format(profile.createdAt!);

    return Column(
      children: [
        _StatusCard(
          label: context.l10n.profileStatus,
          value: context.l10n.profileActive,
          icon: Icons.verified_user_outlined,
        ),
        const shad.Gap(12),
        _StatusCard(
          label: context.l10n.profileVerification,
          value: context.l10n.profileVerified,
          icon: Icons.verified_outlined,
        ),
        const shad.Gap(12),
        _StatusCard(
          label: context.l10n.profileMemberSince,
          value: joined,
          icon: Icons.event_outlined,
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 18, color: theme.colorScheme.primary),
          ),
          const shad.Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
