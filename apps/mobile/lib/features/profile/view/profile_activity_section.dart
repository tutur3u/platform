import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/view/profile_activity_chart.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

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
    this.timezoneLoader,
    super.key,
  });

  final int replayToken;
  final ProfileStatsLoader? statsLoader;
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
    final workspace = context.watch<WorkspaceCubit>().state.currentWorkspace;
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
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
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
          : await _repository.getStats(
              workspaceId,
              userId,
              isPersonal: personal,
              timezone: timezone,
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
    final l10n = context.l10n;
    final stats = _stats;
    if (_scope == null) return const SizedBox.shrink();
    if (_failed) {
      return Center(
        child: TextButton.icon(
          icon: const Icon(Icons.refresh),
          label: Text(l10n.commonRetry),
          onPressed: () {
            final user = context.read<AuthCubit>().state.user;
            final workspace = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace;
            if (user != null && workspace != null) {
              setState(() => _failed = false);
              unawaited(_load(workspace.id, user.id, workspace.personal));
            }
          },
        ),
      );
    }
    if (stats == null) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: NovaLoadingIndicator()),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.profilePrivateActivity,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final entry in [
              (l10n.timerToday, stats.todayTime, 'calendar'),
              (l10n.timerThisWeek, stats.weekTime, 'tasks'),
              (l10n.timerThisMonth, stats.monthTime, 'mail'),
            ])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Builder(
                    builder: (context) {
                      final palette = AppCardPalette.resolve(
                        context,
                        index: 0,
                        moduleId: entry.$3,
                      );
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: palette.background,
                          border: Border.all(
                            color: palette.border.withValues(alpha: .5),
                          ),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              entry.$1,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: palette.textColor),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              l10n.profileTrackedMinutes(entry.$2 ~/ 60),
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(color: palette.textColor),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        ProfileActivityChart(activity: stats.dailyActivity),
      ],
    );
  }
}
