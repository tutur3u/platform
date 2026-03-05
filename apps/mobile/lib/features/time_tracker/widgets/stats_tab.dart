import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';
import 'package:mobile/features/time_tracker/widgets/stats_cards.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals_section.dart';
import 'package:mobile/features/time_tracker/widgets/workspace_stats_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum TimeTrackerStatsScope { personal, workspace }

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
  late TimeTrackerStatsScope _scope;

  @override
  void initState() {
    super.initState();
    _scope = widget.initialScope;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      children: [
        const shad.Gap(16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: _scope == TimeTrackerStatsScope.personal
                    ? shad.PrimaryButton(
                        onPressed: () {},
                        child: Text(l10n.timerStatsPersonal),
                      )
                    : shad.OutlineButton(
                        onPressed: () {
                          setState(() {
                            _scope = TimeTrackerStatsScope.personal;
                          });
                        },
                        child: Text(l10n.timerStatsPersonal),
                      ),
              ),
              const shad.Gap(8),
              Expanded(
                child: _scope == TimeTrackerStatsScope.workspace
                    ? shad.PrimaryButton(
                        onPressed: () {},
                        child: Text(l10n.timerStatsWorkspace),
                      )
                    : shad.OutlineButton(
                        onPressed: () {
                          setState(() {
                            _scope = TimeTrackerStatsScope.workspace;
                          });
                        },
                        child: Text(l10n.timerStatsWorkspace),
                      ),
              ),
            ],
          ),
        ),
        const shad.Gap(12),
        Expanded(
          child: _scope == TimeTrackerStatsScope.personal
              ? const _PersonalStatsView()
              : const WorkspaceStatsTab(),
        ),
      ],
    );
  }
}

class _PersonalStatsView extends StatefulWidget {
  const _PersonalStatsView();

  @override
  State<_PersonalStatsView> createState() => _PersonalStatsViewState();
}

class _PersonalStatsViewState extends State<_PersonalStatsView> {
  int _tabIndex = 0;

  void _loadGoalsIfNeeded(String wsId) {
    if (wsId.isEmpty) {
      return;
    }
    unawaited(context.read<TimeTrackerCubit>().loadGoals(wsId));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final wsId = context.select<WorkspaceCubit, String?>(
      (c) => c.state.currentWorkspace?.id,
    );
    final theme = shad.Theme.of(context);

    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        if (_tabIndex == 1 &&
            wsId != null &&
            !state.hasLoadedGoals &&
            !state.isGoalsLoading) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) {
              return;
            }
            _loadGoalsIfNeeded(wsId);
          });
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: shad.Tabs(
                index: _tabIndex,
                onChanged: (value) {
                  setState(() => _tabIndex = value);
                  if (value == 1 && wsId != null) {
                    _loadGoalsIfNeeded(wsId);
                  }
                },
                children: [
                  shad.TabItem(child: Text(l10n.timerStatsTitle)),
                  shad.TabItem(child: Text(l10n.timerGoalsTitle)),
                ],
              ),
            ),
            const shad.Gap(12),
            Expanded(
              child: _tabIndex == 0
                  ? ListView(
                      padding: const EdgeInsets.only(bottom: 32),
                      children: [
                        StatsCards(stats: state.stats),
                        const shad.Gap(8),
                        ActivityHeatmap(
                          dailyActivity: state.stats?.dailyActivity ?? [],
                        ),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.only(bottom: 32),
                      children: [
                        if (wsId != null)
                          TimeTrackerGoalsSection(wsId: wsId)
                        else
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Text(
                              l10n.commonSomethingWentWrong,
                              style: theme.typography.textSmall.copyWith(
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        );
      },
    );
  }
}
