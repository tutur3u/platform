import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimatesStats extends StatelessWidget {
  const TaskEstimatesStats({required this.state, super.key});

  final TaskEstimatesState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final columns = responsiveValue(
      context,
      compact: 2,
      medium: 3,
      expanded: 3,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.count(
        crossAxisCount: columns,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _TaskEstimateStatCard(
            icon: Icons.view_kanban_outlined,
            label: l10n.taskEstimatesTotalBoards,
            value: '${state.totalBoards}',
          ),
          _TaskEstimateStatCard(
            icon: Icons.calculate_outlined,
            label: l10n.taskEstimatesConfiguredBoards,
            value: '${state.configuredBoards}',
          ),
          _TaskEstimateStatCard(
            icon: Icons.expand_outlined,
            label: l10n.taskEstimatesExtendedRangeBoards,
            value: '${state.extendedBoards}',
          ),
        ],
      ),
    );
  }
}

class _TaskEstimateStatCard extends StatelessWidget {
  const _TaskEstimateStatCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      padding: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 16, color: theme.colorScheme.primary),
                ),
                const Spacer(),
                Text(
                  value,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const shad.Gap(8),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
