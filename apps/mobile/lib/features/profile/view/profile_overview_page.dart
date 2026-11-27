import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_focus_time_section.dart';
import 'package:mobile/features/profile/view/profile_identity_header.dart';
import 'package:mobile/features/profile/view/profile_plan_and_credits.dart';
import 'package:mobile/features/profile/view/profile_sections.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/profile/view/profile_timeline_section.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';

export 'package:mobile/features/profile/view/profile_focus_time_section.dart'
    show ProfileStatsLoader;

/// The Profile destination: who is signed in, Focus Time, account
/// switching, shortcuts to settings, then Sign out and Delete account. The
/// top bar carries the workspace picker.
class ProfileOverviewPage extends StatefulWidget {
  const ProfileOverviewPage({
    this.replayToken = 0,
    this.statsLoader,
    this.timezoneLoader,
    this.cacheUserId,
    super.key,
  });

  /// Changes when the Profile dock item is re-selected; the profile and
  /// Focus Time reload.
  final int replayToken;

  /// Focus Time data sources for tests; production uses the defaults.
  final ProfileStatsLoader? statsLoader;
  final Future<String> Function()? timezoneLoader;
  final String? Function()? cacheUserId;

  @override
  State<ProfileOverviewPage> createState() => _ProfileOverviewPageState();
}

class _ProfileOverviewPageState extends State<ProfileOverviewPage> {
  static const _ownerId = 'profile-overview';
  static const Set<String> _locations = {Routes.profileRoot};

  final _activity = GlobalKey<ProfileTimelineSectionState>();
  final _credits = GlobalKey<ProfilePlanAndCreditsState>();
  final _focusTime = GlobalKey<ProfileFocusTimeSectionState>();

  @override
  void didUpdateWidget(covariant ProfileOverviewPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken != oldWidget.replayToken) {
      unawaited(_refreshProfile());
    }
  }

  Future<void> _refreshProfile() async {
    final current = context.read<AuthCubit>().state.user;
    if (current == null) return;
    await context.read<ShellProfileCubit>().loadFromAuthenticatedUser(
      current,
      forceRefresh: true,
    );
  }

  Future<void> _refresh() => Future.wait([
    _refreshProfile(),
    if (_activity.currentState case final activity?) activity.refresh(),
    if (_credits.currentState case final credits?) credits.refresh(),
    if (_focusTime.currentState case final focus?) focus.refresh(),
  ]);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = context.select<AuthCubit, ({String? id, String? email})>(
      (cubit) => (id: cubit.state.user?.id, email: cubit.state.user?.email),
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        BlocBuilder<ShellProfileCubit, ShellProfileState>(
          builder: (context, state) {
            // A profile loaded for another account is never shown.
            final profile =
                state.userId == user.id && state.profile?.id == user.id
                ? state.profile
                : null;
            return NovaRefreshIndicator(
              onRefresh: _refresh,
              child: ProfileOverviewList(
                profile: profile,
                avatarUrl: profile == null ? null : state.avatarUrl,
                topInset: floatingShellHeaderInset(context),
                header: ProfileIdentityHeader(
                  profile: profile,
                  loading:
                      user.id != null && profile == null && state.error == null,
                  fallbackEmail: user.email,
                  avatarUrl: profile == null ? null : state.avatarUrl,
                ),
                activity: user.id == null
                    ? null
                    : ProfileTimelineSection(
                        key: _activity,
                        previewLimit: 5,
                        cacheUserId: widget.cacheUserId,
                        replayToken: widget.replayToken,
                      ),
                accountDetails: user.id == null
                    ? null
                    : ProfilePlanAndCredits(
                        key: _credits,
                        cacheUserId: widget.cacheUserId,
                        replayToken: widget.replayToken,
                      ),
                focusTime: user.id == null
                    ? null
                    : ProfileFocusTimeSection(
                        key: _focusTime,
                        replayToken: widget.replayToken,
                        statsLoader: widget.statsLoader,
                        timezoneLoader: widget.timezoneLoader,
                        cacheUserId: widget.cacheUserId,
                      ),
              ),
            );
          },
        ),
        ShellTitleOverride(
          ownerId: _ownerId,
          locations: _locations,
          title: l10n.profileTitle,
        ),
      ],
    );
  }
}

/// The Profile sections in order below [header].
class ProfileOverviewList extends StatelessWidget {
  const ProfileOverviewList({
    required this.header,
    this.profile,
    this.avatarUrl,
    this.focusTime,
    this.activity,
    this.accountDetails,
    this.topInset = 0,
    super.key,
  });

  final Widget header;
  final UserProfile? profile;
  final String? avatarUrl;

  /// Focus Time; absent while signed out.
  final Widget? focusTime;
  final Widget? activity;
  final Widget? accountDetails;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final primary = <Widget>[if (activity case final section?) section];
    final sidebar = <Widget>[
      if (accountDetails case final section?) section,
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfileGroupLabel(context.l10n.navSettings),
          ProfileCard(
            children: [
              ProfileAccountSwitchRow(profile: profile, avatarUrl: avatarUrl),
            ],
          ),
          const SizedBox(height: AppLayout.itemGap),
          const ProfileLinkGroups(),
          const SizedBox(height: AppLayout.sectionGap),
          const ProfileDangerGroup(),
        ],
      ),
    ];
    List<Widget> spaced(List<Widget> children) => [
      for (final (index, child) in children.indexed) ...[
        if (index > 0) const SizedBox(height: AppLayout.sectionGap),
        child,
      ],
    ];
    return AppPageListView(
      kind: AppPageKind.root,
      physics: const AlwaysScrollableScrollPhysics(),
      topInset: topInset,
      children: spaced([
        header,
        ?focusTime,
        LayoutBuilder(
          builder: (context, constraints) {
            final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
            if (primary.isEmpty || constraints.maxWidth < 720 * scale) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: spaced([...primary, ...sidebar]),
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 3, child: primary.single),
                const SizedBox(width: AppLayout.sectionGap),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: spaced(sidebar),
                  ),
                ),
              ],
            );
          },
        ),
      ]),
    );
  }
}
