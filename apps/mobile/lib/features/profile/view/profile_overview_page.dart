import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/profile/view/workspace_activity_section.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Account home. Opening personal activity never implies consent to share it.
class ProfileOverviewPage extends StatefulWidget {
  const ProfileOverviewPage({this.replayToken = 0, super.key});

  final int replayToken;

  @override
  State<ProfileOverviewPage> createState() => _ProfileOverviewPageState();
}

class _ProfileOverviewPageState extends State<ProfileOverviewPage> {
  bool _timeline = false;
  bool _dates = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
    return BlocBuilder<ShellProfileCubit, ShellProfileState>(
      builder: (context, state) {
        final profile = state.profile;
        final name =
            profile?.displayName ?? profile?.fullName ?? l10n.profileTitle;
        return Stack(
          children: [
            ShellTitleOverride(
              ownerId: 'profile-overview',
              locations: const {Routes.profileRoot},
              title: _timeline
                  ? l10n.profileTimelineTitle
                  : l10n.profileOverviewTab,
            ),
            ShellChromeActions(
              ownerId: 'profile-overview',
              locations: const {Routes.profileRoot},
              onResetSection: _timeline
                  ? () => setState(() {
                      _timeline = false;
                      _dates = false;
                    })
                  : null,
              actions: [
                if (!_timeline)
                  ShellActionSpec(
                    id: 'profile-switch-account',
                    icon: Icons.switch_account_outlined,
                    tooltip: l10n.authSwitchAccount,
                    onPressed: () =>
                        unawaited(showProfileAccountSwitcher(context)),
                  ),
                if (_timeline)
                  ShellActionSpec(
                    id: 'profile-day-trail',
                    icon: _dates
                        ? Icons.view_agenda_outlined
                        : Icons.date_range,
                    tooltip: _dates
                        ? l10n.profileTimelineHideDates
                        : l10n.profileTimelineShowDates,
                    highlighted: _dates,
                    callbackToken: _dates,
                    onPressed: () => setState(() => _dates = !_dates),
                  ),
                ShellActionSpec(
                  id: 'profile-view-overview',
                  segmentGroup: 'profile-views',
                  icon: Icons.person_outline_rounded,
                  tooltip: l10n.profileOverviewTab,
                  highlighted: !_timeline,
                  callbackToken: _timeline,
                  onPressed: () => setState(() => _timeline = false),
                ),
                ShellActionSpec(
                  id: 'profile-view-timeline',
                  segmentGroup: 'profile-views',
                  icon: Icons.history_rounded,
                  tooltip: l10n.profileTimelineTitle,
                  highlighted: _timeline,
                  callbackToken: _timeline,
                  onPressed: () => setState(() => _timeline = true),
                ),
                ShellActionSpec(
                  id: 'profile-settings',
                  inDock: true,
                  icon: Icons.settings_outlined,
                  tooltip: l10n.navSettings,
                  onPressed: () => context.go(Routes.settings),
                ),
              ],
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final maxWidth =
                    ResponsivePadding.rootContentWidth(context.deviceClass) ??
                    constraints.maxWidth;
                final horizontal =
                    ((constraints.maxWidth - maxWidth) / 2).clamp(
                      0.0,
                      double.infinity,
                    ) +
                    ResponsivePadding.horizontal(context.deviceClass);
                if (_timeline) {
                  return Padding(
                    padding: EdgeInsets.fromLTRB(
                      horizontal,
                      floatingShellHeaderInset(context) + 10,
                      horizontal,
                      0,
                    ),
                    child: ProfileTimelineSection(
                      replayToken: widget.replayToken,
                      fullSurface: true,
                      datesOpen: _dates,
                      onDatesChanged: (open) => setState(() => _dates = open),
                    ),
                  );
                }
                return ListView(
                  padding: EdgeInsets.fromLTRB(
                    horizontal,
                    floatingShellHeaderInset(context) + 10,
                    horizontal,
                    24 + MediaQuery.paddingOf(context).bottom,
                  ),
                  key: ValueKey(_timeline),
                  children: [
                    Container(
                      key: const ValueKey('profile-overview-content'),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final scale =
                              MediaQuery.textScalerOf(context).scale(14) / 14;
                          final stacked = constraints.maxWidth < 360 * scale;
                          return Wrap(
                            spacing: 14,
                            runSpacing: 12,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(24),
                                child: SizedBox.square(
                                  dimension: 68,
                                  child:
                                      state.profile == null &&
                                          state.error == null
                                      ? const FinanceSkeletonBlock(
                                          height: 68,
                                          radius: 24,
                                        )
                                      : state.avatarUrl == null
                                      ? const Icon(
                                          Icons.person_outline,
                                          size: 48,
                                        )
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
                              SizedBox(
                                width: stacked
                                    ? constraints.maxWidth
                                    : constraints.maxWidth - 82,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (state.profile == null &&
                                        state.error == null)
                                      const FinanceSkeletonBlock(
                                        height: 24,
                                        width: 150,
                                      )
                                    else
                                      Text(
                                        name,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.typography.large.copyWith(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    if (profile?.email != null)
                                      Text(
                                        profile!.email!,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    IconButton(
                                      tooltip: l10n.profileIdentitySectionTitle,
                                      onPressed: () =>
                                          context.push(Routes.settingsProfile),
                                      icon: const Icon(
                                        Icons.edit_outlined,
                                        size: 20,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    if (userId != null && workspace != null) ...[
                      const SizedBox(height: 14),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final activity = ProfileActivitySection(
                            replayToken: widget.replayToken,
                          );
                          if (workspace.personal) {
                            return activity;
                          }
                          final workspaceActivity = WorkspaceActivitySection(
                            key: ValueKey('$userId:${workspace.id}'),
                            workspaceId: workspace.id,
                            replayToken: widget.replayToken,
                            workspaceName: displayWorkspaceNameOrFallback(
                              context,
                              workspace,
                            ),
                          );
                          if (constraints.maxWidth < 840) {
                            return Column(
                              children: [
                                activity,
                                const shad.Gap(16),
                                workspaceActivity,
                              ],
                            );
                          }
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: activity),
                              const SizedBox(width: 20),
                              Expanded(child: workspaceActivity),
                            ],
                          );
                        },
                      ),
                    ],
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
