import 'dart:async';

import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/tasks/widgets/task_surface.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskSectionAccordion extends StatelessWidget {
  const TaskSectionAccordion({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.accentColor,
    required this.tasks,
    required this.isCollapsed,
    required this.onToggle,
    this.trailingCount,
    super.key,
  });

  final String title;
  final String subtitle;
  final Widget icon;
  final Color accentColor;
  final List<UserTask> tasks;
  final bool isCollapsed;
  final VoidCallback onToggle;
  final int? trailingCount;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final count = trailingCount ?? tasks.length;

    return TaskSurfacePane(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(18),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                        accentColor.withValues(alpha: 0.1),
                        theme.colorScheme.secondary,
                      ),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: accentColor.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Center(child: icon),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.typography.p.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          style: theme.typography.xSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                        accentColor.withValues(alpha: 0.08),
                        theme.colorScheme.secondary,
                      ),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: accentColor.withValues(alpha: 0.1),
                      ),
                    ),
                    child: Text(
                      '$count',
                      style: theme.typography.xSmall.copyWith(
                        fontWeight: FontWeight.w800,
                        color: accentColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    isCollapsed ? Icons.expand_more : Icons.expand_less,
                    color: theme.colorScheme.mutedForeground,
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            child: isCollapsed
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Column(
                      children: [
                        for (var i = 0; i < tasks.length; i++) ...[
                          _TaskTile(task: tasks[i]),
                          if (i != tasks.length - 1)
                            Divider(
                              height: 16,
                              color: theme.colorScheme.border.withValues(
                                alpha: 0.45,
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.task});

  final UserTask task;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final boardName = task.list?.board?.name;
    final listName = task.list?.name;
    final subtitle = [
      if (boardName != null && boardName.isNotEmpty) boardName,
      if (listName != null && listName.isNotEmpty) listName,
    ].join(' / ');

    return shad.GhostButton(
      onPressed: () => unawaited(
        openUserTaskBoardDetailWithWorkspace(
          context,
          task,
          workspaceCubit: _workspaceCubitOrNull(context),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PriorityIndicator(priority: task.priority),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (task.name?.trim().isNotEmpty ?? false)
                        ? task.name!.trim()
                        : l10n.tasksUntitled,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textMuted,
                    ),
                  ],
                  if (task.priority != null) ...[
                    const SizedBox(height: 6),
                    _PriorityChip(priority: task.priority!, l10n: l10n),
                  ],
                ],
              ),
            ),
            if (task.endDate != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: BoxDecoration(
                  color: theme.colorScheme.muted,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  DateFormat.MMMd(
                    Localizations.localeOf(context).toLanguageTag(),
                  ).format(task.endDate!),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

WorkspaceCubit? _workspaceCubitOrNull(BuildContext context) {
  try {
    return context.read<WorkspaceCubit>();
  } on Object {
    return null;
  }
}

class _PriorityIndicator extends StatelessWidget {
  const _PriorityIndicator({this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.circle,
      size: 12,
      color: _colorForPriority(priority, shad.Theme.of(context).colorScheme),
    );
  }

  static Color _colorForPriority(String? priority, shad.ColorScheme colors) {
    return switch (priority) {
      'critical' => colors.destructive,
      'high' => Colors.orange,
      'low' => colors.mutedForeground,
      _ => colors.primary,
    };
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({required this.priority, required this.l10n});

  final String priority;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = _PriorityIndicator._colorForPriority(
      priority,
      theme.colorScheme,
    );

    final label = switch (priority) {
      'critical' => l10n.tasksPriorityCritical,
      'high' => l10n.tasksPriorityHigh,
      'low' => l10n.tasksPriorityLow,
      _ => l10n.tasksPriorityNormal,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
