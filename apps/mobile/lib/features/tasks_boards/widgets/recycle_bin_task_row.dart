import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class RecycleBinTaskRow extends StatelessWidget {
  const RecycleBinTaskRow({
    required this.task,
    required this.isSelected,
    required this.onSelected,
    super.key,
    this.listName,
    this.disabled = false,
  });

  final TaskBoardTask task;
  final String? listName;
  final bool isSelected;
  final ValueChanged<bool> onSelected;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final taskName = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final firstProjectName = task.projects.isNotEmpty
        ? task.projects.first.name?.trim()
        : null;
    final palette = context.dynamicColors;
    final priority = TaskPriorityLevel.tryParse(task.priority);

    return Opacity(
      opacity: disabled ? 0.5 : 1.0,
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(
              color: isSelected
                  ? theme.colorScheme.primary
                  : theme.colorScheme.border,
              width: 3,
            ),
          ),
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.05)
              : null,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            shad.Checkbox(
              state: isSelected
                  ? shad.CheckboxState.checked
                  : shad.CheckboxState.unchecked,
              onChanged: disabled
                  ? null
                  : (v) => onSelected(v == shad.CheckboxState.checked),
            ),
            const shad.Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    taskName,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const shad.Gap(6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (priority != null)
                        _buildBadge(
                          label: priority.label(context.l10n),
                          color: priority.color(palette),
                          icon: priority.icon,
                        ),
                      if (listName != null && listName!.isNotEmpty)
                        _buildBadge(
                          label: context.l10n.taskBoardDetailFromList(
                            listName!,
                          ),
                          color: palette.purple,
                          icon: Icons.folder_open_outlined,
                        ),
                      ..._buildLabelBadges(palette),
                      if (task.estimationPoints != null)
                        _buildBadge(
                          label: context.l10n.taskBoardDetailPoints(
                            task.estimationPoints!,
                          ),
                          color: palette.sky,
                        ),
                      if (task.projects.isNotEmpty)
                        _buildBadge(
                          label:
                              task.projects.length == 1 &&
                                  firstProjectName != null &&
                                  firstProjectName.isNotEmpty
                              ? firstProjectName
                              : context.l10n.taskBoardDetailNProjects(
                                  task.projects.length,
                                ),
                          color: palette.sky,
                          icon: Icons.folder_outlined,
                        ),
                    ],
                  ),
                  const shad.Gap(6),
                  Row(
                    children: [
                      Icon(
                        Icons.delete_outline,
                        size: 12,
                        color: theme.colorScheme.mutedForeground,
                      ),
                      const shad.Gap(4),
                      Text(
                        _formatDeletedTime(context),
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildLabelBadges(DynamicColors palette) {
    final validLabels = task.labels
        .where((l) => l.name?.trim().isNotEmpty == true)
        .take(3)
        .toList();
    if (validLabels.isEmpty) return [];

    return validLabels
        .map((label) {
          return _buildBadge(
            label: label.name!.trim(),
            color: _labelColor(palette, label.color),
          );
        })
        .toList(growable: false);
  }

  Widget _buildBadge({
    required String label,
    required Color color,
    IconData? icon,
  }) {
    final backgroundColor = color.withValues(alpha: 0.15);
    final foregroundColor = color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 10, color: foregroundColor),
            const SizedBox(width: 4),
          ],
          Text(
            label.trim(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: foregroundColor,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDeletedTime(BuildContext context) {
    final deletedAt = task.closedAt;
    if (deletedAt == null) {
      return context.l10n.taskBoardDetailDeletedAgo(
        context.l10n.notificationsJustNow,
      );
    }

    final difference = DateTime.now().difference(deletedAt);
    final timeAgo = switch (difference.inDays) {
      > 0 => context.l10n.taskBoardDetailDaysAgo(difference.inDays),
      _ => switch (difference.inHours) {
        > 0 => context.l10n.notificationsHoursAgo(difference.inHours),
        _ => switch (difference.inMinutes) {
          > 0 => context.l10n.notificationsMinutesAgo(difference.inMinutes),
          _ => context.l10n.notificationsJustNow,
        },
      },
    };

    return context.l10n.taskBoardDetailDeletedAgo(timeAgo);
  }

  /// Named label colours use the shared dynamic tokens; hex values are the
  /// label's own stored colour.
  Color _labelColor(DynamicColors palette, String? raw) =>
      switch (raw?.trim().toUpperCase()) {
        'RED' => palette.red,
        'ORANGE' => palette.orange,
        'YELLOW' => palette.yellow,
        'GREEN' => palette.green,
        'BLUE' || 'SKY' => palette.blue,
        'PURPLE' => palette.purple,
        'PINK' => palette.pink,
        _ => parseTaskLabelColor(raw) ?? palette.gray,
      };
}
