import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_account_actions.dart';
import 'package:mobile/features/profile/view/profile_activity_section.dart';
import 'package:mobile/features/profile/view/profile_identity_card.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/profile/view/profile_you_rows.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// Account home. Opening personal activity never implies consent to share it.
class ProfileOverviewPage extends StatefulWidget {
  const ProfileOverviewPage({
    this.replayToken = 0,
    this.cacheUserId,
    this.statsLoader,
    this.timezoneLoader,
    this.timelineRepository,
    super.key,
  });

  final int replayToken;
  final String? Function()? cacheUserId;

  /// Data sources for render tests; production uses the defaults.
  @visibleForTesting
  final ProfileStatsLoader? statsLoader;
  @visibleForTesting
  final Future<String> Function()? timezoneLoader;
  @visibleForTesting
  final ProfileTimelineRepository? timelineRepository;

  @override
  State<ProfileOverviewPage> createState() => _ProfileOverviewPageState();
}

class _ProfileOverviewPageState extends State<ProfileOverviewPage> {
  bool _timeline = false;
  bool _dates = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final userId = context.watch<AuthCubit>().state.user?.id;
    return BlocBuilder<ShellProfileCubit, ShellProfileState>(
      builder: (context, state) {
        final profile = state.userId == userId && state.profile?.id == userId
            ? state.profile
            : null;
        final avatarUrl = profile == null ? null : state.avatarUrl;
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
                    icon: LucideIcons.users,
                    tooltip: l10n.authSwitchAccount,
                    onPressed: () =>
                        unawaited(showProfileAccountSwitcher(context)),
                  ),
                if (_timeline)
                  ShellActionSpec(
                    id: 'profile-day-trail',
                    icon: _dates
                        ? LucideIcons.rows3
                        : LucideIcons.calendarRange,
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
                  icon: LucideIcons.user,
                  tooltip: l10n.profileOverviewTab,
                  highlighted: !_timeline,
                  callbackToken: _timeline,
                  onPressed: () => setState(() => _timeline = false),
                ),
                ShellActionSpec(
                  id: 'profile-view-timeline',
                  segmentGroup: 'profile-views',
                  icon: LucideIcons.history,
                  tooltip: l10n.profileTimelineTitle,
                  highlighted: _timeline,
                  callbackToken: _timeline,
                  onPressed: () => setState(() => _timeline = true),
                ),
                ShellActionSpec(
                  id: 'profile-settings',
                  inDock: true,
                  icon: LucideIcons.settings,
                  tooltip: l10n.navSettings,
                  onPressed: () => context.go(Routes.settings),
                ),
              ],
            ),
            if (_timeline)
              LayoutBuilder(
                builder: (context, constraints) => ProfileTimelineSection(
                  replayToken: widget.replayToken,
                  cacheUserId: widget.cacheUserId,
                  repository: widget.timelineRepository,
                  fullSurface: true,
                  contentTopPadding:
                      floatingShellHeaderInset(context) + AppLayout.pageTop,
                  horizontalPadding: AppPageInsets.resolve(
                    width: constraints.maxWidth,
                    safeArea: MediaQuery.paddingOf(context),
                  ),
                  datesOpen: _dates,
                  onDatesChanged: (open) => setState(() => _dates = open),
                ),
              )
            else
              AppPageListView(
                key: ValueKey(_timeline),
                kind: AppPageKind.root,
                topInset: floatingShellHeaderInset(context),
                children: [
                  _OverviewLayout(
                    identity: ProfileIdentityCard(
                      profile: profile,
                      avatarUrl: avatarUrl,
                      userId: userId,
                      loading: profile == null && state.error == null,
                    ),
                    activity: userId == null
                        ? null
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Focus Time is tracked time; See all opens the
                              // Timer statistics.
                              AppSectionHeader(
                                key: const ValueKey('you-focus-time'),
                                title: l10n.profileFocusTime,
                                actionLabel: l10n.homeSeeAll,
                                onAction: () => context.go(Routes.timerStats),
                              ),
                              ProfileActivitySection(
                                // Focus Time is all task-linked tracked time.
                                taskLinked: true,
                                replayToken: widget.replayToken,
                                cacheUserId: widget.cacheUserId,
                                statsLoader: widget.statsLoader,
                                timezoneLoader: widget.timezoneLoader,
                              ),
                            ],
                          ),
                  ),
                  const SizedBox(height: AppLayout.sectionGap),
                  ProfileYouRows(
                    onOpenTimeline: () => setState(() => _timeline = true),
                  ),
                ],
              ),
          ],
        );
      },
    );
  }
}

/// Identity above activity; side by side once the body is wide enough for a
/// readable activity column next to the identity card.
class _OverviewLayout extends StatelessWidget {
  const _OverviewLayout({required this.identity, required this.activity});

  static const double _twoColumnMinWidth = 840;
  static const double _identityWidth = 360;

  final Widget identity;
  final Widget? activity;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final activity = this.activity;
      if (activity == null) return identity;
      if (constraints.maxWidth < _twoColumnMinWidth) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            identity,
            const SizedBox(height: AppLayout.sectionGap),
            activity,
          ],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: _identityWidth, child: identity),
          const SizedBox(width: AppLayout.sectionGap),
          Expanded(child: activity),
        ],
      );
    },
  );
}
