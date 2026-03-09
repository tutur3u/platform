import 'package:flutter/material.dart';
import 'package:mobile/data/models/task_estimate_board.dart';
import 'package:mobile/features/tasks_estimates/utils/estimation_type_meta.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskEstimationDistribution extends StatelessWidget {
  const TaskEstimationDistribution({required this.boards, super.key});

  final List<TaskEstimateBoard> boards;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final types = estimationTypes(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.taskEstimatesDistributionTitle,
                style: shad.Theme.of(context).typography.large,
              ),
              const shad.Gap(12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final type in types)
                    _DistributionChip(
                      label: type.label,
                      count: boards
                          .where((board) => board.estimationType == type.value)
                          .length,
                      extendedCount: boards
                          .where(
                            (board) =>
                                board.estimationType == type.value &&
                                board.extendedEstimation,
                          )
                          .length,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DistributionChip extends StatelessWidget {
  const _DistributionChip({
    required this.label,
    required this.count,
    required this.extendedCount,
  });

  final String label;
  final int count;
  final int extendedCount;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: theme.typography.small),
          const shad.Gap(8),
          shad.OutlineBadge(child: Text('$count')),
          if (extendedCount > 0) ...[
            const shad.Gap(6),
            Text(
              '+$extendedCount ext',
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
