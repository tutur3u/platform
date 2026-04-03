import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';
import 'package:mobile/features/time_tracker/widgets/stats_cards.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals_section.dart';
import 'package:mobile/features/time_tracker/widgets/workspace_stats_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum TimeTrackerStatsScope { personal, workspace }

enum _StatsSurface { personal, workspace, goals }

class StatsTab extends StatefulWidget {
  const StatsTab({
    super.key,
    this.initialScope = TimeTrackerStatsScope.personal,
  });

  final TimeTrackerStatsScope initialScope;

  @override
  State<StatsTab> createState() => _StatsTabState();
}

class _StatsTabState extends State<StatsTab> {
  late _StatsSurface _surface;
  String? _goalsLoadRequestedWsId;

  @override
  void initState() {
    super.initState();
    _surface = widget.initialScope == TimeTrackerStatsScope.workspace
        ? _StatsSurface.workspace
        : _StatsSurface.personal;
  }

  @override
  void didUpdateWidget(covariant StatsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialScope == oldWidget.initialScope) {
      return;
    }

    setState(() {
      _surface = widget.initialScope == TimeTrackerStatsScope.workspace
          ? _StatsSurface.workspace
          : _StatsSurface.personal;
    });
  }

  void _selectSurface(_StatsSurface nextSurface) {
    setState(() {
      _surface = nextSurface;
      if (nextSurface != _StatsSurface.goals) {
        _goalsLoadRequestedWsId = null;
      }
    });

    if (nextSurface != _StatsSurface.goals) {
      return;
    }

    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    _requestGoalsLoadIfNeeded(
      wsId: wsId,
      state: context.read<TimeTrackerCubit>().state,
    );
  }

  void _requestGoalsLoadIfNeeded({
    required String wsId,
    required TimeTrackerState state,
  }) {
    if (_surface != _StatsSurface.goals || wsId.isEmpty) {
      return;
    }
    if (state.hasLoadedGoalsFor(wsId) || state.isGoalsLoadingFor(wsId)) {
      return;
    }
    if (_goalsLoadRequestedWsId == wsId) {
      return;
    }

    _goalsLoadRequestedWsId = wsId;
    unawaited(context.read<TimeTrackerCubit>().loadGoals(wsId));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceState = context.watch<WorkspaceCubit>().state;
    final wsId = workspaceState.currentWorkspace?.id ?? '';
    final theme = shad.Theme.of(context);

    return BlocConsumer<TimeTrackerCubit, TimeTrackerState>(
      listener: (context, state) {
        if (wsId.isEmpty) {
          _goalsLoadRequestedWsId = null;
          return;
        }

        if (_goalsLoadRequestedWsId != null &&
            _goalsLoadRequestedWsId != wsId) {
          _goalsLoadRequestedWsId = null;
        }

        if (state.hasLoadedGoalsFor(wsId) && _goalsLoadRequestedWsId == wsId) {
          _goalsLoadRequestedWsId = null;
        }

        _requestGoalsLoadIfNeeded(wsId: wsId, state: state);
      },
      builder: (context, state) {
        return Stack(
          children: [
            ShellMiniNav(
              ownerId: 'time-tracker-stats-mini-nav',
              locations: const {Routes.timerStats, Routes.timerManagement},
              deepLinkBackRoute: Routes.timer,
              items: [
                ShellMiniNavItemSpec(
                  id: 'back',
                  icon: Icons.chevron_left,
                  label: l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.timer),
                ),
                _buildItem(
                  label: l10n.timerStatsPersonal,
                  icon: Icons.person_outline_rounded,
                  surface: _StatsSurface.personal,
                ),
                _buildItem(
                  label: l10n.timerStatsWorkspace,
                  icon: Icons.apartment_outlined,
                  surface: _StatsSurface.workspace,
                ),
                _buildItem(
                  label: l10n.timerGoalsTitle,
                  icon: Icons.flag_outlined,
                  surface: _StatsSurface.goals,
                ),
              ],
            ),
            switch (_surface) {
              _StatsSurface.personal => ListView(
                padding: const EdgeInsets.only(top: 16, bottom: 96),
                children: [
                  StatsCards(stats: state.stats),
                  const shad.Gap(8),
                  ActivityHeatmap(
                    dailyActivity: state.stats?.dailyActivity ?? [],
                  ),
                ],
              ),
              _StatsSurface.workspace => const WorkspaceStatsTab(),
              _StatsSurface.goals => ListView(
                padding: const EdgeInsets.only(top: 16, bottom: 96),
                children: [
                  if (wsId.isNotEmpty)
                    TimeTrackerGoalsSection(wsId: wsId)
                  else if (workspaceState.status == WorkspaceStatus.error)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        l10n.commonSomethingWentWrong,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    )
                  else if (workspaceState.status == WorkspaceStatus.loaded)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        l10n.workspaceSelectEmpty,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    )
                  else
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: shad.CircularProgressIndicator(),
                      ),
                    ),
                ],
              ),
            },
          ],
        );
      },
    );
  }

  ShellMiniNavItemSpec _buildItem({
    required String label,
    required IconData icon,
    required _StatsSurface surface,
  }) {
    return ShellMiniNavItemSpec(
      id: surface.name,
      icon: icon,
      label: label,
      selected: _surface == surface,
      callbackToken: '${surface.name}-${_surface.name}',
      onPressed: () => _selectSurface(surface),
    );
  }
}
