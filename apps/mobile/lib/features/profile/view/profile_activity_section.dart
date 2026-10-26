import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/profile/view/profile_activity_summary.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

typedef ProfileStatsLoader =
    Future<TimeTrackerStats> Function(
      String workspaceId,
      String userId,
      String timezone, {
      required bool personal,
    });

/// Personal, user-filtered activity. Never requests a workspace-wide aggregate.
class ProfileActivitySection extends StatefulWidget {
  const ProfileActivitySection({
    this.replayToken = 0,
    this.statsLoader,
    this.tag,
    this.taskLinked = false,
    this.cacheUserId,
    this.timezoneLoader,
    super.key,
  });

  final int replayToken;
  final String? Function()? cacheUserId;
  final ProfileStatsLoader? statsLoader;

  /// Counts only sessions with this tag (for example `pomodoro`).
  final String? tag;

  /// Counts only sessions linked to a task; Focus Time sets it.
  final bool taskLinked;
  final Future<String> Function()? timezoneLoader;

  @override
  State<ProfileActivitySection> createState() => _ProfileActivitySectionState();
}

class _ProfileActivitySectionState extends State<ProfileActivitySection> {
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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspace = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.watch<WorkspaceCubit>(),
    );
    final scope = userId == null || workspace == null
        ? null
        : '$userId:${workspace.id}';
    if (_scope == scope) return;
    _scope = scope;
    _stats = null;
    _failed = false;
    _request++;
    if (scope != null) {
      unawaited(_load(workspace!.id, userId!, workspace.personal));
    }
  }

  @override
  void didUpdateWidget(covariant ProfileActivitySection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken == oldWidget.replayToken) return;
    final user = context.read<AuthCubit>().state.user;
    final workspace = verifiedPersonalProfileWorkspace(
      userId: user?.id,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.read<WorkspaceCubit>(),
    );
    if (user != null && workspace != null) {
      unawaited(_load(workspace.id, user.id, workspace.personal));
    }
  }

  Future<void> _load(String workspaceId, String userId, bool personal) async {
    final request = ++_request;
    try {
      final timezone =
          await (widget.timezoneLoader ?? getCurrentTimezoneIdentifier)();
      if (!mounted || request != _request) return;
      final stats = widget.statsLoader != null
          ? await widget.statsLoader!(
              workspaceId,
              userId,
              timezone,
              personal: personal,
            )
          : await ApiClient.runForUser(
              userId,
              () => _repository.getStats(
                workspaceId,
                userId,
                isPersonal: personal,
                timezone: timezone,
                tag: widget.tag,
                taskLinked: widget.taskLinked,
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

  void _retry() {
    final user = context.read<AuthCubit>().state.user;
    final workspace = verifiedPersonalProfileWorkspace(
      userId: user?.id,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.read<WorkspaceCubit>(),
    );
    if (user != null && workspace != null) {
      setState(() => _failed = false);
      unawaited(_load(workspace.id, user.id, workspace.personal));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stats = _stats;
    final Widget body;
    if (_scope == null) {
      body = AppGroupedCard(
        children: [
          AppStateMessage.inline(
            icon: LucideIcons.lock,
            title: l10n.profileTimelineUnavailable,
          ),
        ],
      );
    } else if (_failed) {
      body = AppGroupedCard(
        children: [
          AppStateMessage.inline(
            icon: LucideIcons.cloudOff,
            tone: AppTone.destructive,
            title: l10n.commonSomethingWentWrong,
            actionLabel: l10n.commonRetry,
            onAction: _retry,
          ),
        ],
      );
    } else if (stats == null) {
      body = const ProfileActivitySkeleton();
    } else {
      body = ProfileActivitySummary(stats: stats);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppSectionHeader(
          title: l10n.profilePrivateActivity,
          icon: LucideIcons.lock,
        ),
        body,
      ],
    );
  }
}
