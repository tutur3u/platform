import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Identity summary at the top of Settings: avatar, name, email, workspace
/// count and quick actions to the existing profile and workspace settings.
class SettingsProfileHeader extends StatelessWidget {
  const SettingsProfileHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final profile = context.watch<ShellProfileCubit?>()?.state;
    final user = context.watch<AuthCubit?>()?.state.user;
    final email = profile?.profile?.email ?? user?.email;
    final metadataName =
        user?.userMetadata?['full_name'] ?? user?.userMetadata?['name'];
    final name = _firstFilled([
      profile?.profile?.displayName,
      profile?.profile?.fullName,
      if (metadataName is String) metadataName,
      email?.split('@').first,
    ], l10n.settingsNavYou);
    final workspaceCount = context.select<WorkspaceCubit, int>((cubit) {
      final state = cubit.state;
      final count = state.workspaces.length;
      return count == 0 && state.currentWorkspace != null ? 1 : count;
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          label: '$name, ${l10n.settingsProfileEdit}',
          excludeSemantics: true,
          child: InkWell(
            key: const ValueKey('settings-profile-header'),
            borderRadius: BorderRadius.circular(SettingsRowLayout.cardRadius),
            onTap: () => context.push(Routes.settingsProfile),
            child: Padding(
              padding: const EdgeInsets.all(SettingsRowLayout.captionInset),
              child: Row(
                children: [
                  _HeaderAvatar(
                    url: normalizeAvatarUrl(profile?.avatarUrl),
                    cacheKey: profile?.avatarIdentityKey,
                    name: name,
                  ),
                  const shad.Gap(16),
                  Expanded(
                    flex: 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (email != null && email.isNotEmpty)
                          Text(
                            email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.base.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (workspaceCount > 0) ...[
                    const shad.Gap(12),
                    // Large text wraps the label instead of crowding the name.
                    Flexible(
                      child: Column(
                        key: const ValueKey('settings-profile-workspaces'),
                        children: [
                          Text(
                            '$workspaceCount',
                            style: theme.typography.large.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            l10n.settingsProfileWorkspaceCount(workspaceCount),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: theme.typography.small.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        const shad.Gap(16),
        Row(
          children: [
            Expanded(
              child: SettingsPillButton(
                key: const ValueKey('settings-edit-profile'),
                label: l10n.settingsProfileEdit,
                onPressed: () => context.push(Routes.settingsProfile),
              ),
            ),
            const shad.Gap(12),
            Expanded(
              child: SettingsPillButton(
                key: const ValueKey('settings-open-workspace'),
                label: l10n.settingsProfileManageWorkspace,
                onPressed: () => context.push(Routes.settingsWorkspace),
              ),
            ),
          ],
        ),
      ],
    );
  }

  static String _firstFilled(List<String?> values, String fallback) {
    for (final value in values) {
      final trimmed = value?.trim();
      if (trimmed != null && trimmed.isNotEmpty) return trimmed;
    }
    return fallback;
  }
}

/// Equal-width outlined pill used for Settings quick actions.
class SettingsPillButton extends StatelessWidget {
  const SettingsPillButton({
    required this.label,
    required this.onPressed,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final shape = StadiumBorder(
      side: BorderSide(color: theme.colorScheme.border),
    );
    return Material(
      color: SettingsRowLayout.groupFill(context),
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Center(
              child: Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.base.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HeaderAvatar extends StatelessWidget {
  const _HeaderAvatar({required this.url, required this.name, this.cacheKey});

  static const double size = 64;

  final String? url;
  final String? cacheKey;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final initial = name.characters.first.toUpperCase();
    final fallback = ColoredBox(
      color: theme.colorScheme.muted,
      child: Center(
        child: Text(
          initial,
          style: theme.typography.xLarge.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
    final source = url;
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: source == null
            ? fallback
            : Image(
                image: CachedNetworkImageProvider(
                  source,
                  cacheKey: cacheKey ?? avatarIdentityKeyForUrl(source),
                ),
                fit: BoxFit.cover,
                gaplessPlayback: true,
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}
