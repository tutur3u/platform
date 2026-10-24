import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:mobile/features/settings/view/settings_profile_parts.dart';

/// Identity summary at the top of Settings: avatar, name, email, workspace
/// count and quick actions to the existing profile and workspace settings.
class SettingsProfileHeader extends StatelessWidget {
  const SettingsProfileHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
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

    return LayoutBuilder(
      builder: (context, constraints) {
        final statWidth = workspaceCount > 0
            ? SettingsWorkspaceStat.naturalWidth(context, workspaceCount)
            : 0.0;
        // Beside the name while the name keeps a readable width; otherwise
        // (large text, narrow screens) the stat moves to its own line.
        final besideName =
            constraints.maxWidth - statWidth - 8 >=
            SettingsProfileAvatar.size + 16 + 96;
        return _layout(
          context,
          name,
          email,
          profile,
          workspaceCount,
          besideName,
        );
      },
    );
  }

  Widget _layout(
    BuildContext context,
    String name,
    String? email,
    ShellProfileState? profile,
    int workspaceCount,
    bool besideName,
  ) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final radius = BorderRadius.circular(SettingsRowLayout.cardRadius);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(
                button: true,
                label: '$name, ${l10n.settingsProfileEdit}',
                excludeSemantics: true,
                child: InkWell(
                  key: const ValueKey('settings-profile-header'),
                  borderRadius: radius,
                  onTap: () => context.push(Routes.settingsProfile),
                  child: Padding(
                    padding: const EdgeInsets.all(
                      SettingsRowLayout.captionInset,
                    ),
                    child: Row(
                      children: [
                        SettingsProfileAvatar(
                          url: normalizeAvatarUrl(profile?.avatarUrl),
                          cacheKey: profile?.avatarIdentityKey,
                          name: name,
                        ),
                        const shad.Gap(16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 1,
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
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (workspaceCount > 0 && besideName) ...[
              const shad.Gap(8),
              // Natural width on one line; the name ellipsizes instead.
              SettingsWorkspaceStat(count: workspaceCount, radius: radius),
            ],
          ],
        ),
        if (workspaceCount > 0 && !besideName)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: SettingsWorkspaceStat(
              count: workspaceCount,
              radius: radius,
              inline: true,
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
