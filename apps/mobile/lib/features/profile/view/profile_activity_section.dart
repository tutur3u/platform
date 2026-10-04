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
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/profile/view/profile_activity_chart.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    this.cacheUserId,
    this.timezoneLoader,
    super.key,
  });

  final int replayToken;
  final String? Function()? cacheUserId;
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
    final l10n = context.l10n;
    final stats = _stats;
    if (_scope == null) return Text(l10n.profileTimelineUnavailable);
    if (_failed) {
      return Center(
        child: TextButton.icon(
          icon: const Icon(Icons.refresh),
          label: Text(l10n.commonRetry),
          onPressed: () {
            final user = context.read<AuthCubit>().state.user;
            final workspace = verifiedPersonalProfileWorkspace(
              userId: user?.id,
              cacheUserId:
                  (widget.cacheUserId ?? currentPersonalProfileUserId)(),
              workspaces: context.read<WorkspaceCubit>(),
            );
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
          style: shad.Theme.of(
            context,
          ).typography.large.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
            final columns = constraints.maxWidth >= 480 * scale ? 3 : 1;
            final width =
                ((constraints.maxWidth - 12 * (columns - 1)) / columns)
                    .floorToDouble();
            return Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                for (final entry in [
                  (l10n.timerToday, stats.todayTime, 'calendar'),
                  (l10n.timerThisWeek, stats.weekTime, 'tasks'),
                  (l10n.timerThisMonth, stats.monthTime, 'mail'),
                ])
                  SizedBox(
                    width: width,
                    child: Builder(
                      builder: (context) {
                        final palette = AppCardPalette.resolve(
                          context,
                          index: 0,
                          moduleId: entry.$3,
                        );
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.$1,
                                style: shad.Theme.of(
                                  context,
                                ).typography.textSmall,
                              ),
                              Text(
                                l10n.profileTrackedMinutes(entry.$2 ~/ 60),
                                style: shad.Theme.of(context).typography.base
                                    .copyWith(
                                      color: palette.textColor,
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),
        ProfileActivityChart(activity: stats.dailyActivity),
      ],
    );
  }
}
