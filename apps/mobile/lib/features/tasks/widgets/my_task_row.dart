import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/widgets/task_card_metadata.dart';
import 'package:mobile/features/tasks_boards/widgets/task_priority_visuals.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class MyTaskRow extends StatefulWidget {
  const MyTaskRow({
    required this.task,
    required this.workspaceId,
    required this.now,
    required this.completed,
    required this.onOpen,
    required this.onComplete,
    required this.onSnooze,
    this.zone,
    super.key,
  });

  final UserTask task;
  final String workspaceId;
  final DateTime now;
  final bool completed;
  final VoidCallback? onOpen;
  final Future<void> Function() onComplete;
  final Future<void> Function() onSnooze;
  final String? zone;

  @override
  State<MyTaskRow> createState() => _MyTaskRowState();
}

class _MyTaskRowState extends State<MyTaskRow> {
  bool _checking = false;
  bool _snoozing = false;

  Future<void> _complete() async {
    if (_checking || _snoozing) return;
    setState(() => _checking = true);
    unawaited(AppHaptics.selection());
    try {
      if (!MediaQuery.disableAnimationsOf(context)) {
        await Future<void>.delayed(const Duration(milliseconds: 185));
      }
      if (mounted) await widget.onComplete();
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _snooze() async {
    if (_checking || _snoozing) return;
    setState(() => _snoozing = true);
    try {
      await widget.onSnooze();
    } finally {
      if (mounted) setState(() => _snoozing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : l10n.taskBoardDetailUntitledTask;
    final path = [task.list?.board?.name, task.list?.name]
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .join(' / ');
    final priority = TaskPriorityLevel.tryParse(task.priority);
    final checked = widget.completed || _checking;
    final busy = _checking || _snoozing;
    final radius = BorderRadius.circular(tokens.shapes.card);
    final row = PendingSyncFrame(
      workspaceId:
          task.list?.board?.wsId ??
          task.list?.board?.workspace?.id ??
          widget.workspaceId,
      entityId: task.id,
      feature: 'tasks',
      child: Material(
        color: c.card,
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: busy ? null : widget.onOpen,
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.xs,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.sm,
            ),
            child: Row(
              children: [
                AnimatedScale(
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 185),
                  curve: Curves.easeOutBack,
                  scale: _checking ? 1.20 : 1,
                  child: AppCheckbox(
                    key: ValueKey('my-task-complete-${task.id}'),
                    value: checked,
                    semanticLabel: l10n.taskBoardDetailCompleteTask,
                    onChanged: widget.completed || busy
                        ? null
                        : (_) => unawaited(_complete()),
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: AppSpacing.xs,
                    children: [
                      Text(
                        title,
                        style: tokens.typography.body.copyWith(
                          fontWeight: FontWeight.w600,
                          color: checked ? c.mutedForeground : c.foreground,
                          decoration: checked
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (path.isNotEmpty || task.endDate != null)
                        Wrap(
                          spacing: AppSpacing.xs,
                          runSpacing: AppSpacing.xs,
                          children: [
                            if (path.isNotEmpty) TaskMetadataChip(label: path),
                            if (task.endDate case final due?)
                              TaskDueChip(
                                due: due,
                                now: widget.now,
                                zone: widget.zone,
                                completed: checked,
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
                if (priority != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  TaskPriorityMark(level: priority),
                ],
                if (task.assignees.isNotEmpty) ...[
                  const SizedBox(width: AppSpacing.sm),
                  TaskAssigneeStack(assignees: task.assignees),
                ],
              ],
            ),
          ),
        ),
      ),
    );
    if (widget.completed) return row;
    return Semantics(
      customSemanticsActions: {
        CustomSemanticsAction(label: l10n.tasksSnooze): () =>
            unawaited(_snooze()),
      },
      child: Dismissible(
        key: ValueKey('my-task-swipe-${task.id}'),
        direction: busy ? DismissDirection.none : DismissDirection.horizontal,
        background: _SwipeBackground(
          icon: LucideIcons.check,
          label: l10n.taskBoardDetailCompleteTask,
          tone: AppTone.success,
        ),
        secondaryBackground: _SwipeBackground(
          icon: LucideIcons.calendarClock,
          label: l10n.tasksSnooze,
          tone: AppTone.info,
          trailing: true,
        ),
        confirmDismiss: (direction) async {
          if (direction == DismissDirection.startToEnd) {
            await _complete();
          } else {
            await _snooze();
          }
          return false;
        },
        child: row,
      ),
    );
  }
}

class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.icon,
    required this.label,
    required this.tone,
    this.trailing = false,
  });

  final IconData icon;
  final String label;
  final AppTone tone;
  final bool trailing;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final color = tone.foreground(AppTokens.of(context).colorScheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(tokens.shapes.card),
        color: color.withValues(alpha: .14),
      ),
      alignment: trailing
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: AppSpacing.sm,
        children: [
          Icon(icon, color: color, size: 18),
          Text(label, style: tokens.typography.small.copyWith(color: color)),
        ],
      ),
    );
  }
}
