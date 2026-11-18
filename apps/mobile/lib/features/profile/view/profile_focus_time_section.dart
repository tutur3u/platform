import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/profile/view/profile_focus_time_card.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

typedef ProfileStatsLoader =
    Future<TimeTrackerStats> Function(
      String workspaceId,
      String userId,
      String timezone, {
      required bool personal,
    });

/// Loads the signed-in user's task-linked tracked time from their personal
/// workspace and shows it as [ProfileFocusTimeCard]. It never requests a
/// workspace-wide aggregate, and shows nothing without a verified personal
/// workspace.
class ProfileFocusTimeSection extends StatefulWidget {
  const ProfileFocusTimeSection({
    this.replayToken = 0,
    this.statsLoader,
    this.timezoneLoader,
    this.cacheUserId,
    super.key,
  });

  /// Reloads when it changes.
  final int replayToken;
  final ProfileStatsLoader? statsLoader;
  final Future<String> Function()? timezoneLoader;
  final String? Function()? cacheUserId;

  @override
  State<ProfileFocusTimeSection> createState() =>
      ProfileFocusTimeSectionState();
}

class ProfileFocusTimeSectionState extends State<ProfileFocusTimeSection> {
  final _api = ApiClient();
  final _http = http.Client();
  late final _repository = TimeTrackerRepository(
    apiClient: _api,
    httpClient: _http,
  );
  String? _scope;
  int _request = 0;
  TimeTrackerStats? _stats;
  bool _failed = false;

  /// Reloads the figures; Profile's pull to refresh awaits it.
  Future<void> refresh() async {
    final user = context.read<AuthCubit>().state.user;
    final workspace = _workspace(user?.id, context.read<WorkspaceCubit>());
    if (user == null || workspace == null) return;
    if (_failed) setState(() => _failed = false);
    await _load(workspace.id, user.id, personal: workspace.personal);
  }

  Workspace? _workspace(String? userId, WorkspaceCubit workspaces) =>
      verifiedPersonalProfileWorkspace(
        userId: userId,
        cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
        workspaces: workspaces,
      );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = _workspace(userId, context.watch<WorkspaceCubit>());
    final scope = userId == null || workspace == null
        ? null
        : '$userId:${workspace.id}';
    if (_scope == scope) return;
    _scope = scope;
    _stats = null;
    _failed = false;
    _request++;
    if (scope != null) {
      unawaited(_load(workspace!.id, userId!, personal: workspace.personal));
    }
  }

  @override
  void didUpdateWidget(covariant ProfileFocusTimeSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken != oldWidget.replayToken) unawaited(refresh());
  }

  Future<void> _load(
    String workspaceId,
    String userId, {
    required bool personal,
  }) async {
    final request = ++_request;
    try {
      final timezone =
          await (widget.timezoneLoader ?? getCurrentTimezoneIdentifier)();
      if (!mounted || request != _request) return;
      final loader = widget.statsLoader;
      final stats = loader != null
          ? await loader(workspaceId, userId, timezone, personal: personal)
          : await ApiClient.runForUser(
              userId,
              () => _repository.getStats(
                workspaceId,
                userId,
                isPersonal: personal,
                timezone: timezone,
                // Focus Time is all task-linked tracked time.
                taskLinked: true,
              ),
            );
      if (!mounted || request != _request) return;
      setState(() {
        _stats = stats;
        _failed = false;
      });
    } on Exception {
      if (!mounted || request != _request) return;
      setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _request++;
    _api.dispose();
    _http.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_scope == null) return const SizedBox.shrink();
    return ProfileFocusTimeCard(
      stats: _stats,
      onSeeAll: () => context.go(Routes.timerStats),
      onRetry: _failed ? () => unawaited(refresh()) : null,
    );
  }
}
