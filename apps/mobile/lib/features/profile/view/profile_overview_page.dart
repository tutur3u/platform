import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/profile/view/workspace_activity_section.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Account home. Opening personal activity never implies consent to share it.
class ProfileOverviewPage extends StatelessWidget {
  const ProfileOverviewPage({this.replayToken = 0, super.key});

  final int replayToken;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
    return BlocBuilder<ShellProfileCubit, ShellProfileState>(
      builder: (context, state) {
        final profile = state.profile;
        final name =
            profile?.displayName ?? profile?.fullName ?? l10n.profileTitle;
        return Stack(
          children: [
            ShellChromeActions(
              ownerId: 'profile-overview',
              locations: const {Routes.profileRoot},
              actions: [
                ShellActionSpec(
                  id: 'profile-settings',
                  inDock: true,
                  icon: Icons.settings_outlined,
                  tooltip: l10n.navSettings,
                  onPressed: () => context.go(Routes.settings),
                ),
                ShellActionSpec(
                  id: 'profile-switch-account',
                  icon: Icons.switch_account_outlined,
                  tooltip: l10n.authSwitchAccount,
                  onPressed: () =>
                      unawaited(showProfileAccountSwitcher(context)),
                ),
              ],
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final maxWidth =
                    ResponsivePadding.maxContentWidth(context.deviceClass) ??
                    constraints.maxWidth;
                final horizontal =
                    ((constraints.maxWidth - maxWidth) / 2).clamp(
                      0.0,
                      double.infinity,
                    ) +
                    ResponsivePadding.horizontal(context.deviceClass);
                return ListView(
                  padding: EdgeInsets.fromLTRB(
                    horizontal,
                    20,
                    horizontal,
                    24 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(24),
                            child: SizedBox.square(
                              dimension: 68,
                              child: state.avatarUrl == null
                                  ? const Icon(Icons.person_outline, size: 48)
                                  : Image.network(
                                      state.avatarUrl!,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, error, stack) =>
                                          const Icon(
                                            Icons.person_outline,
                                            size: 48,
                                          ),
                                    ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: Theme.of(
                                    context,
                                  ).textTheme.headlineSmall,
                                ),
                                if (profile?.email != null)
                                  Text(
                                    profile!.email!,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                TextButton.icon(
                                  onPressed: () =>
                                      context.go(Routes.profileEdit),
                                  icon: const Icon(
                                    Icons.edit_outlined,
                                    size: 18,
                                  ),
                                  label: Text(l10n.profileIdentitySectionTitle),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    ProfileActivitySection(replayToken: replayToken),
                    if (workspace != null &&
                        !workspace.personal &&
                        userId != null)
                      WorkspaceActivitySection(
                        key: ValueKey('$userId:${workspace.id}'),
                        workspaceId: workspace.id,
                        replayToken: replayToken,
                        workspaceName: displayWorkspaceNameOrFallback(
                          context,
                          workspace,
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        );
      },
    );
  }
}
