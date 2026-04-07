import 'package:flutter/material.dart';
import 'package:mobile/data/models/task_board_task.dart';
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
    final priorityConfig = _getPriorityConfig(context, task.priority);

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
                      if (priorityConfig != null)
                        _buildBadge(
                          label: priorityConfig.label,
                          backgroundColor: priorityConfig.backgroundColor,
                          foregroundColor: priorityConfig.foregroundColor,
                        ),
                      if (listName != null && listName!.isNotEmpty)
                        _buildBadge(
                          label: context.l10n.taskBoardDetailFromList(
                            listName!,
                          ),
                          backgroundColor: Colors.purple.withValues(
                            alpha: 0.15,
                          ),
                          foregroundColor: Colors.purple,
                          icon: Icons.folder_open_outlined,
                        ),
                      ..._buildLabelBadges(),
                      if (task.estimationPoints != null)
                        _buildBadge(
                          label: context.l10n.taskBoardDetailPoints(
                            task.estimationPoints!,
                          ),
                          backgroundColor: const Color(0x334BADD1),
                          foregroundColor: const Color(0xFF7DD3FC),
                        ),
                      if (task.projects.isNotEmpty)
                        _buildBadge(
                          label: task.projects.length == 1
                              ? (task.projects.first.name ?? '')
                              : context.l10n.taskBoardDetailNProjects(
                                  task.projects.length,
                                ),
                          backgroundColor: const Color(0x334BADD1),
                          foregroundColor: const Color(0xFF7DD3FC),
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

  _PriorityConfig? _getPriorityConfig(BuildContext context, String? priority) {
    if (priority == null) return null;

    switch (priority.toLowerCase()) {
      case 'critical':
        return _PriorityConfig(
          label: context.l10n.taskBoardDetailPriorityCritical,
          backgroundColor: const Color(0x33FF4444),
          foregroundColor: const Color(0xFFFF6B6B),
        );
      case 'high':
        return _PriorityConfig(
          label: context.l10n.taskBoardDetailPriorityHigh,
          backgroundColor: const Color(0x33FF8C42),
          foregroundColor: const Color(0xFFFFA726),
        );
      case 'normal':
        return _PriorityConfig(
          label: context.l10n.taskBoardDetailPriorityNormal,
          backgroundColor: const Color(0x334285F4),
          foregroundColor: const Color(0xFF6699FF),
        );
      case 'low':
        return _PriorityConfig(
          label: context.l10n.taskBoardDetailPriorityLow,
          backgroundColor: const Color(0x33666666),
          foregroundColor: const Color(0xFFAAAAAA),
        );
      default:
        return null;
    }
  }

  List<Widget> _buildLabelBadges() {
    final validLabels = task.labels
        .where((l) => l.name?.trim().isNotEmpty == true)
        .take(3)
        .toList();
    if (validLabels.isEmpty) return [];

    return validLabels
        .map((label) {
          final color = _parseColor(label.color);
          return _buildBadge(
            label: label.name!.trim(),
            backgroundColor: color.withValues(alpha: 0.15),
            foregroundColor: color,
          );
        })
        .toList(growable: false);
  }

  Widget _buildBadge({
    required String label,
    required Color backgroundColor,
    required Color foregroundColor,
    IconData? icon,
  }) {
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

  Color _parseColor(String? colorString) {
    if (colorString == null || colorString.isEmpty) {
      return const Color(0xFFAAAAAA);
    }

    switch (colorString.toUpperCase()) {
      case 'RED':
        return const Color(0xFFFF6B6B);
      case 'ORANGE':
        return const Color(0xFFFFA726);
      case 'YELLOW':
        return const Color(0xFFFFD54F);
      case 'GREEN':
        return const Color(0xFF66BB6A);
      case 'BLUE':
      case 'SKY':
        return const Color(0xFF6699FF);
      case 'PURPLE':
        return const Color(0xFFB388FF);
      case 'PINK':
        return const Color(0xFFFF8A80);
      case 'GRAY':
      case 'GREY':
        return const Color(0xFFAAAAAA);
      default:
        try {
          final hex = colorString.replaceFirst('#', '');
          return Color(int.parse('FF$hex', radix: 16));
        } on FormatException {
          return const Color(0xFFAAAAAA);
        }
    }
  }
}

class _PriorityConfig {
  const _PriorityConfig({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final String label;
  final Color backgroundColor;
  final Color foregroundColor;
}
