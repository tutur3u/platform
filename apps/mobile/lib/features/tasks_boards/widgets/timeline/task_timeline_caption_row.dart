import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_metrics.dart';

/// A group caption: "Overdue N" in the destructive colour, or a list name.
class TaskTimelineCaptionRow extends StatelessWidget {
  const TaskTimelineCaptionRow({
    required this.caption,
    required this.label,
    required this.metrics,
    super.key,
  });

  final TaskTimelineCaption caption;
  final String label;
  final TaskTimelineMetrics metrics;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final color = caption.isOverdue ? c.destructive : c.mutedForeground;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        metrics.inset + AppSpacing.xs,
        AppSpacing.md,
        metrics.inset,
        AppSpacing.xs,
      ),
      child: Semantics(
        header: true,
        child: Row(
          children: [
            if (caption.isOverdue) ...[
              Icon(LucideIcons.circleAlert, size: 14, color: color),
              const SizedBox(width: AppSpacing.xs),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.xSmall.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
