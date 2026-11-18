import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_focus_time_section.dart';
import 'package:mobile/features/profile/view/profile_identity_header.dart';
import 'package:mobile/features/profile/view/profile_sections.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
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
                topInset: floatingShellHeaderInset(context),
                header: ProfileIdentityHeader(
                  profile: profile,
                  loading:
                      user.id != null && profile == null && state.error == null,
                  fallbackEmail: user.email,
                  avatarUrl: profile == null ? null : state.avatarUrl,
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
        ShellChromeActions(
          ownerId: _ownerId,
          locations: _locations,
          actions: [
            ShellActionSpec(
              id: 'profile-workspace-picker',
              icon: LucideIcons.building2,
              tooltip: l10n.settingsSwitchWorkspace,
              onPressed: () => showWorkspacePickerSheet(context),
            ),
          ],
        ),
      ],
    );
  }
}

/// The Profile sections in order below [header].
class ProfileOverviewList extends StatelessWidget {
  const ProfileOverviewList({
    required this.header,
    this.focusTime,
    this.topInset = 0,
    super.key,
  });

  final Widget header;

  /// Focus Time; absent while signed out.
  final Widget? focusTime;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final focusTime = this.focusTime;
    return AppPageListView(
      physics: const AlwaysScrollableScrollPhysics(),
      topInset: topInset,
      children: [
        header,
        if (focusTime != null) ...[
          const SizedBox(height: AppLayout.itemGap),
          focusTime,
        ],
        const SizedBox(height: AppLayout.sectionGap - AppSpacing.sm),
        const ProfileCard(children: [ProfileAccountSwitchRow()]),
        const SizedBox(height: AppLayout.itemGap),
        const ProfileLinkGroups(),
        const SizedBox(height: AppLayout.sectionGap - AppSpacing.sm),
        const ProfileDangerGroup(),
      ],
    );
  }
}
