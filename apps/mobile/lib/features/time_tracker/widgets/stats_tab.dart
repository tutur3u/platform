import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/activity_heatmap.dart';
import 'package:mobile/features/time_tracker/widgets/stats_cards.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class StatsTab extends StatelessWidget {
  const StatsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const shad.Gap(16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                l10n.timerStatsTitle,
                style: theme.typography.p.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const shad.Gap(12),
            StatsCards(stats: state.stats),
            const shad.Gap(8),
            ActivityHeatmap(
              dailyActivity: state.stats?.dailyActivity ?? [],
            ),
          ],
        );
      },
    );
  }
}

