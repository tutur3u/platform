import 'package:flutter/material.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimates_feedback.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskLabelsSection extends StatelessWidget {
  const TaskLabelsSection({
    required this.labels,
    required this.isSaving,
    required this.onEdit,
    required this.onDelete,
    super.key,
  });

  final List<TaskLabel> labels;
  final bool isSaving;
  final ValueChanged<TaskLabel> onEdit;
  final ValueChanged<TaskLabel> onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: labels.isEmpty
          ? TaskEstimatesEmptyState(
              title: l10n.taskLabelsEmptyTitle,
              description: l10n.taskLabelsEmptyDescription,
            )
          : ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: labels.length,
              separatorBuilder: (_, _) => const shad.Gap(8),
              itemBuilder: (context, index) {
                final label = labels[index];
                return _TaskLabelCard(
                  label: label,
                  disabled: isSaving,
                  onEdit: () => onEdit(label),
                  onDelete: () => onDelete(label),
                );
              },
            ),
    );
  }
}

class _TaskLabelCard extends StatelessWidget {
  const _TaskLabelCard({
    required this.label,
    required this.disabled,
    required this.onEdit,
    required this.onDelete,
  });

  final TaskLabel label;
  final bool disabled;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = parseTaskLabelColor(label.color) ?? theme.colorScheme.primary;

    return shad.Card(
      child: Row(
        children: [
          Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.p.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  label.color.toUpperCase(),
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: disabled ? null : onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: disabled ? null : onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }
}
