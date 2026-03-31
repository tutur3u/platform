import 'package:flutter/material.dart';
import 'package:mobile/core/utils/color_hex.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
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

    return labels.isEmpty
        ? TaskEstimatesEmptyState(
            title: l10n.taskLabelsEmptyTitle,
            description: l10n.taskLabelsEmptyDescription,
          )
        : Column(
            children: [
              for (var index = 0; index < labels.length; index++) ...[
                if (index > 0) const shad.Gap(10),
                _TaskLabelCard(
                  label: labels[index],
                  disabled: isSaving,
                  onEdit: () => onEdit(labels[index]),
                  onDelete: () => onDelete(labels[index]),
                ),
              ],
            ],
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
    final colorText = label.color.isNotEmpty
        ? label.color.toUpperCase()
        : colorToHexString(theme.colorScheme.primary);

    return TaskSurfacePane(
      child: Row(
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.28),
                  blurRadius: 14,
                ),
              ],
            ),
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
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const shad.Gap(2),
                Text(
                  colorText,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          Semantics(
            button: true,
            label: context.l10n.taskLabelsEdit,
            child: shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: disabled ? null : onEdit,
              child: const Icon(Icons.edit_outlined, size: 16),
            ),
          ),
          Semantics(
            button: true,
            label: context.l10n.taskLabelsDelete,
            child: shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: disabled ? null : onDelete,
              child: const Icon(Icons.delete_outline, size: 16),
            ),
          ),
        ],
      ),
    );
  }
}
