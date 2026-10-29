import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/settings_group.dart';
import 'package:mobile/features/settings/view/settings_profile_parts.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mobile/features/shell/avatar_url_identity.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/hidden_workspaces_settings_row.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// First Settings group: who is signed in and which workspace is active.
///
/// Profile and workspace are ordinary rows, so they share the grouped-card
/// rhythm of every other section instead of a separate header.
class SettingsAccountSection extends StatelessWidget {
  const SettingsAccountSection({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceName = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.name,
    );
    return SettingsCompactSection(
      title: l10n.settingsAccountSectionTitle,
      children: [
        const SettingsProfileRow(key: ValueKey('settings-profile-row')),
        SettingsTile(
          key: const ValueKey('settings-workspace-row'),
          grouped: true,
          icon: LucideIcons.building2,
          title: l10n.settingsNavWorkspace,
          value: workspaceName ?? l10n.settingsNoWorkspaceSelected,
          onTap: () => context.push(Routes.settingsWorkspace),
        ),
        SettingsTile(
          key: const ValueKey('settings-switch-workspace-row'),
          grouped: true,
          icon: LucideIcons.arrowLeftRight,
          title: l10n.settingsSwitchWorkspace,
          onTap: () => showWorkspacePickerSheet(context),
        ),
        const HiddenWorkspacesSettingsRow(
          key: ValueKey('settings-hidden-workspaces-row'),
          grouped: true,
        ),
      ],
    );
  }
}

/// Avatar, name and email; opens the profile editor.
class SettingsProfileRow extends StatelessWidget {
  const SettingsProfileRow({super.key});

  static const double avatarSize = 44;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final profile = context.watch<ShellProfileCubit?>()?.state;
    final user = context.watch<AuthCubit?>()?.state.user;
    final email = profile?.profile?.email ?? user?.email;
    final metadataName =
        user?.userMetadata?['full_name'] ?? user?.userMetadata?['name'];
    final name = firstFilledName([
      profile?.profile?.displayName,
      profile?.profile?.fullName,
      if (metadataName is String) metadataName,
      email?.split('@').first,
    ], l10n.settingsNavYou);
    final muted = tokens.colorScheme.mutedForeground;
    return Semantics(
      button: true,
      label: '$name, ${l10n.settingsProfile}',
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => context.push(Routes.settingsProfile),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              SettingsRowLayout.inset - 4,
              12,
              SettingsRowLayout.inset - 8,
              12,
            ),
            child: Row(
              children: [
                SettingsProfileAvatar(
                  url: normalizeAvatarUrl(profile?.avatarUrl),
                  cacheKey: profile?.avatarIdentityKey,
                  name: name,
                  size: avatarSize,
                ),
                const AppGap(SettingsRowLayout.textGap - 4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.base.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (email != null && email.isNotEmpty)
                        Text(
                          email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.typography.small.copyWith(color: muted),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  width: SettingsRowLayout.actionWidth,
                  height: 44,
                  child: Icon(LucideIcons.chevronRight, size: 17, color: muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// First non-empty, trimmed value, or [fallback].
String firstFilledName(List<String?> values, String fallback) {
  for (final value in values) {
    final trimmed = value?.trim();
    if (trimmed != null && trimmed.isNotEmpty) return trimmed;
  }
  return fallback;
}
