import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class MyTaskSectionHeader extends StatelessWidget {
  const MyTaskSectionHeader({
    required this.section,
    required this.count,
    required this.collapsed,
    required this.onToggle,
    super.key,
  });

  final TaskListSection section;
  final int count;
  final bool collapsed;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final (label, icon, tone) = switch (section) {
      TaskListSection.overdue => (
        l10n.tasksOverdue,
        LucideIcons.clockAlert,
        AppTone.destructive,
      ),
      TaskListSection.today => (
        l10n.tasksTodaySection,
        LucideIcons.sun,
        AppTone.warning,
      ),
      TaskListSection.upcoming => (
        l10n.tasksUpcoming,
        LucideIcons.calendarDays,
        AppTone.primary,
      ),
      TaskListSection.noDate => (
        l10n.tasksNoDateSection,
        LucideIcons.calendarOff,
        AppTone.neutral,
      ),
      TaskListSection.completed => (
        l10n.tasksCompleted,
        LucideIcons.circleCheck,
        AppTone.success,
      ),
    };
    final colors = tokens.colorScheme;
    return Semantics(
      header: true,
      expanded: onToggle == null ? null : !collapsed,
      child: InkWell(
        borderRadius: BorderRadius.circular(tokens.shapes.card),
        onTap: onToggle,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xs,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              spacing: AppSpacing.sm,
              children: [
                AppIconTile(icon: icon, tone: tone),
                Expanded(
                  child: Text(
                    label,
                    style: tokens.typography.body.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  MaterialLocalizations.of(context).formatDecimal(count),
                  style: tokens.typography.small.copyWith(
                    color: tone.foreground(colors),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (onToggle != null)
                  Icon(
                    collapsed ? LucideIcons.chevronDown : LucideIcons.chevronUp,
                    size: 16,
                    color: colors.mutedForeground,
                  )
                else
                  const SizedBox(width: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
