import 'package:flutter/material.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Read-only summary card shown while a session is running or paused.
///
/// Displays the session title, description, category, and linked task so the
/// user can see what they are tracking without navigating away from the timer.
class RunningSessionInfoCard extends StatelessWidget {
  const RunningSessionInfoCard({
    required this.title,
    this.description,
    this.categoryName,
    this.categoryColor,
    this.taskName,
    this.taskTicketLabel,
    super.key,
  });

  final String? title;
  final String? description;
  final String? categoryName;
  final String? categoryColor;
  final String? taskName;
  final String? taskTicketLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    final effectiveTitle = title?.trim();
    final effectiveDescription = description?.trim();
    final effectiveCategoryName = categoryName?.trim();
    final effectiveTaskName = taskName?.trim();
    final effectiveTicketLabel = taskTicketLabel?.trim();

    final hasCategory =
        effectiveCategoryName != null && effectiveCategoryName.isNotEmpty;
    final hasTask = effectiveTaskName != null && effectiveTaskName.isNotEmpty;
    final hasChips = hasCategory || hasTask;

    Color? dotColor;
    if (hasCategory && categoryColor != null) {
      dotColor = resolveTimeTrackingCategoryColor(
        context,
        categoryColor,
        fallback: colorScheme.mutedForeground,
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.border),
        color: colorScheme.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title row
          Text(
            effectiveTitle?.isNotEmpty == true
                ? effectiveTitle!
                : l10n.timerRunningSessionNoTitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.base.copyWith(
              fontWeight: FontWeight.w600,
              color: effectiveTitle?.isNotEmpty == true
                  ? colorScheme.foreground
                  : colorScheme.mutedForeground,
            ),
          ),
          // Description
          if (effectiveDescription != null &&
              effectiveDescription.isNotEmpty) ...[
            const shad.Gap(6),
            Text(
              effectiveDescription,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.small.copyWith(
                color: colorScheme.mutedForeground,
              ),
            ),
          ],
          // Category + Task chips
          if (hasChips) ...[
            const shad.Gap(10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (hasCategory)
                  _InfoChip(
                    label: effectiveCategoryName,
                    dotColor: dotColor,
                    theme: theme,
                    colorScheme: colorScheme,
                  ),
                if (hasTask)
                  _TaskChip(
                    taskName: effectiveTaskName,
                    ticketLabel: effectiveTicketLabel,
                    theme: theme,
                    colorScheme: colorScheme,
                  ),
              ],
            ),
          ] else ...[
            const shad.Gap(6),
            Text(
              l10n.timerRunningSessionNoDetails,
              style: theme.typography.small.copyWith(
                color: colorScheme.mutedForeground,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.label,
    required this.theme,
    required this.colorScheme,
    this.dotColor,
  });

  final String label;
  final Color? dotColor;
  final shad.ThemeData theme;
  final shad.ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        color: colorScheme.accent.withValues(alpha: 0.5),
        border: Border.all(color: colorScheme.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dotColor != null) ...[
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dotColor,
              ),
            ),
            const shad.Gap(5),
          ] else ...[
            Icon(
              shad.LucideIcons.tag,
              size: 11,
              color: colorScheme.mutedForeground,
            ),
            const shad.Gap(4),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: colorScheme.foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskChip extends StatelessWidget {
  const _TaskChip({
    required this.taskName,
    required this.theme,
    required this.colorScheme,
    this.ticketLabel,
  });

  final String taskName;
  final String? ticketLabel;
  final shad.ThemeData theme;
  final shad.ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        color: colorScheme.primary.withValues(alpha: 0.08),
        border: Border.all(
          color: colorScheme.primary.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            shad.LucideIcons.squareCheck,
            size: 11,
            color: colorScheme.primary,
          ),
          const shad.Gap(5),
          if (ticketLabel != null && ticketLabel!.isNotEmpty) ...[
            Text(
              ticketLabel!,
              style: theme.typography.xSmall.copyWith(
                color: colorScheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(4),
          ],
          Flexible(
            child: Text(
              taskName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: colorScheme.foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
