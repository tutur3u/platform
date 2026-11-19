import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/l10n/l10n.dart';

class TaskMetadataChip extends StatelessWidget {
  const TaskMetadataChip({
    required this.label,
    this.icon,
    this.tone = AppTone.neutral,
    super.key,
  });

  final String label;
  final IconData? icon;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final foreground = tone.foreground(AppTokens.of(context).colorScheme);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xxs,
      ),
      decoration: BoxDecoration(
        color: tone == AppTone.neutral
            ? tokens.colorScheme.muted
            : foreground.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(tokens.shapes.chip),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: foreground),
            const SizedBox(width: AppSpacing.xs),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.xSmall.copyWith(color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}

class TaskDueChip extends StatelessWidget {
  const TaskDueChip({
    required this.due,
    required this.now,
    this.zone,
    this.completed = false,
    super.key,
  });

  final DateTime due;
  final DateTime now;
  final String? zone;
  final bool completed;

  @override
  Widget build(BuildContext context) {
    final day = taskDay(due, zone);
    final today = taskDay(now, zone);
    final tone = completed
        ? AppTone.neutral
        : day.isBefore(today)
        ? AppTone.destructive
        : day == today
        ? AppTone.warning
        : AppTone.neutral;
    return TaskMetadataChip(
      label: DateFormat.MMMd(context.l10n.localeName).format(day),
      icon: LucideIcons.calendar,
      tone: tone,
    );
  }
}

class TaskPriorityMark extends StatelessWidget {
  const TaskPriorityMark({required this.level, super.key});

  final TaskPriorityLevel level;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: level.label(context.l10n),
      child: Icon(
        level.icon,
        size: 15,
        color: level.color(context.dynamicColors),
      ),
    );
  }
}

class TaskAssigneeStack extends StatelessWidget {
  const TaskAssigneeStack({required this.assignees, super.key});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    if (assignees.isEmpty) return const SizedBox.shrink();
    final colors = AppTokens.of(context).colorScheme;
    final names = assignees
        .map((person) => person.displayName?.trim())
        .whereType<String>()
        .where((name) => name.isNotEmpty)
        .join(', ');
    return Semantics(
      label: names.isEmpty ? context.l10n.taskBoardDetailTaskAssignees : names,
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final person in assignees.take(2))
            Align(
              widthFactor: .85,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.card),
                ),
                child: NetworkAvatar(
                  radius: 11,
                  avatarUrl: person.avatarUrl,
                  backgroundColor: colors.accent,
                  child: Text(
                    person.displayName
                            ?.trim()
                            .characters
                            .firstOrNull
                            ?.toUpperCase() ??
                        '·',
                    style: TextStyle(
                      fontSize: 10,
                      color: colors.accentForeground,
                    ),
                  ),
                ),
              ),
            ),
          if (assignees.length > 2)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: AppSpacing.xs),
              child: Text(
                '+${assignees.length - 2}',
                style: AppTokens.of(context).typography.xSmall,
              ),
            ),
        ],
      ),
    );
  }
}
