part of 'task_board_detail_page.dart';

const kTaskBoardOverdueColor = Color(0xFFB42318);

class _BoardTaskTile extends StatelessWidget {
  const _BoardTaskTile({
    required this.board,
    required this.list,
    required this.listStyle,
    required this.task,
    required this.onTap,
    required this.onMove,
    required this.isBulkSelectMode,
    required this.isSelected,
    required this.onToggleSelected,
  });

  final TaskBoardDetail board;
  final TaskBoardList list;
  final _TaskBoardListVisualStyle listStyle;
  final TaskBoardTask task;
  final VoidCallback onTap;
  final VoidCallback onMove;
  final bool isBulkSelectMode;
  final bool isSelected;
  final VoidCallback onToggleSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final hasDescription = _taskHasDescription(task.description);
    final estimationLabel = _taskEstimationLabel(task, board);
    final dueLabel = _taskDueLabelForList(context, task, list);
    final startLabel = _taskStartLabel(context, task);
    final isOverdue = _taskIsOverdueForList(task, list);
    final relationshipIndicators = _taskRelationshipIndicators(task);
    final borderColor = isSelected
        ? theme.colorScheme.primary
        : listStyle.surfaceBorder;

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: isBulkSelectMode ? onToggleSelected : onTap,
          onLongPress: onToggleSelected,
          child: Stack(
            children: [
              Positioned.fill(
                child: Container(
                  color: listStyle.accent.withValues(alpha: 0.07),
                ),
              ),
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 4,
                  color: listStyle.accent.withValues(alpha: 0.7),
                ),
              ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
                decoration: BoxDecoration(
                  border: Border.all(color: borderColor),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Top row: [badge + title | assignees]
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  shad.OutlineBadge(
                                    child: Text(_taskReference(task, board)),
                                  ),
                                  if (isBulkSelectMode) ...[
                                    const shad.Gap(6),
                                    Icon(
                                      isSelected
                                          ? Icons.check_box
                                          : Icons.check_box_outline_blank,
                                      size: 18,
                                      color: isSelected
                                          ? theme.colorScheme.primary
                                          : theme.colorScheme.mutedForeground,
                                    ),
                                  ],
                                ],
                              ),
                              const shad.Gap(4),
                              Text(
                                title,
                                style: theme.typography.small.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (task.assignees.isNotEmpty) ...[
                          const shad.Gap(8),
                          _AssigneeAvatarStack(assignees: task.assignees),
                        ],
                      ],
                    ),
                    // Start date (future only)
                    if (startLabel != null) ...[
                      const shad.Gap(4),
                      Row(
                        children: [
                          Icon(
                            Icons.schedule_outlined,
                            size: 11,
                            color: theme.colorScheme.mutedForeground,
                          ),
                          const shad.Gap(3),
                          Text(
                            startLabel,
                            style: theme.typography.small.copyWith(
                              fontSize: 11,
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ],
                    // Due date
                    if (dueLabel != null) ...[
                      const shad.Gap(4),
                      Row(
                        children: [
                          Icon(
                            Icons.calendar_today_outlined,
                            size: 11,
                            color: isOverdue
                                ? kTaskBoardOverdueColor
                                : theme.colorScheme.mutedForeground,
                          ),
                          const shad.Gap(3),
                          Text(
                            dueLabel,
                            style: theme.typography.small.copyWith(
                              fontSize: 11,
                              color: isOverdue
                                  ? kTaskBoardOverdueColor
                                  : theme.colorScheme.mutedForeground,
                              fontWeight: isOverdue
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                            ),
                          ),
                          if (isOverdue) ...[
                            const shad.Gap(4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: kTaskBoardOverdueColor,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                context.l10n.taskBoardDetailOverdue,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.2,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                    if (relationshipIndicators.isNotEmpty) ...[
                      const shad.Gap(8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: relationshipIndicators
                            .map(
                              (indicator) => _TaskRelationshipIndicatorBadge(
                                indicator: indicator,
                              ),
                            )
                            .toList(growable: false),
                      ),
                    ],
                    // Chips row: priority, estimation, project, labels
                    if (_hasChips(
                      estimationLabel,
                      task,
                      hasDescription: hasDescription,
                    )) ...[
                      const shad.Gap(8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _TaskPriorityChip(priority: task.priority),
                          if (estimationLabel != null)
                            shad.OutlineBadge(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(shad.LucideIcons.timer, size: 12),
                                  const shad.Gap(3),
                                  Text(
                                    estimationLabel,
                                    style: theme.typography.small.copyWith(
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ...task.projects
                              .take(1)
                              .map(
                                (project) => _ProjectBadge(
                                  label: _taskProjectLabel(project),
                                ),
                              ),
                          ...task.labels.take(2).map(_TaskLabelBadge.new),
                          if (task.labels.length > 2)
                            shad.OutlineBadge(
                              child: Text('+${task.labels.length - 2}'),
                            ),
                          if (hasDescription)
                            Tooltip(
                              message: context
                                  .l10n
                                  .taskBoardDetailTaskDescriptionLabel,
                              child: shad.OutlineBadge(
                                child: Icon(
                                  Icons.notes_outlined,
                                  size: 14,
                                  color: theme.colorScheme.mutedForeground,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaginatedPlaceholder extends StatelessWidget {
  const _PaginatedPlaceholder({
    required this.minHeight,
    required this.horizontalPadding,
    required this.style,
    required this.state,
    required this.onCreateTask,
    this.onRetry,
  });

  final double minHeight;
  final EdgeInsets horizontalPadding;
  final _TaskBoardListVisualStyle style;
  final _PaginatedPlaceholderState state;
  final VoidCallback onCreateTask;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isLoading = state == _PaginatedPlaceholderState.loading;
    final isEmpty = state == _PaginatedPlaceholderState.empty;
    final isError = state == _PaginatedPlaceholderState.error;

    return Padding(
      padding: horizontalPadding,
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(minHeight: minHeight),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.background.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: style.surfaceBorder.withValues(alpha: 0.7)),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isLoading)
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              else if (isEmpty)
                Icon(Icons.inbox_outlined, size: 28, color: style.accent)
              else if (isError)
                Icon(
                  Icons.error_outline,
                  size: 24,
                  color: theme.colorScheme.destructive,
                ),
              if (isLoading || isEmpty || isError) const shad.Gap(10),
              Text(
                isLoading
                    ? context.l10n.notificationsLoadingMore
                    : isError
                    ? context.l10n.commonSomethingWentWrong
                    : context.l10n.taskBoardDetailNoTasksInList,
                textAlign: TextAlign.center,
                style: theme.typography.textMuted,
              ),
              if (isEmpty) ...[
                const shad.Gap(12),
                shad.PrimaryButton(
                  leading: const Icon(Icons.add),
                  size: shad.ButtonSize.small,
                  onPressed: onCreateTask,
                  child: Text(context.l10n.taskBoardDetailCreateTask),
                ),
              ],
              if (isError && onRetry != null) ...[
                const shad.Gap(12),
                shad.OutlineButton(
                  onPressed: onRetry,
                  child: Text(context.l10n.commonRetry),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum _BoardListMenuAction { edit }

class _TaskPriorityChip extends StatelessWidget {
  const _TaskPriorityChip({required this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final style = _taskPriorityStyle(context, priority);

    return Container(
      padding: const EdgeInsets.fromLTRB(5, 3, 8, 3),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: style.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: style.foreground.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(style.icon, size: 12, color: style.foreground),
          ),
          const shad.Gap(5),
          Text(
            style.label,
            style: theme.typography.small.copyWith(
              color: style.foreground,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskRelationshipIndicatorBadge extends StatelessWidget {
  const _TaskRelationshipIndicatorBadge({required this.indicator});

  final _TaskRelationshipIndicator indicator;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = _taskRelationshipColor(context, indicator.kind);
    final label = _taskRelationshipLabel(context, indicator.kind);

    return Tooltip(
      message: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_taskRelationshipIcon(indicator.kind), size: 12, color: color),
            const shad.Gap(4),
            Text(
              '${indicator.count}',
              style: theme.typography.small.copyWith(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskLabelBadge extends StatelessWidget {
  const _TaskLabelBadge(this.label);

  final TaskBoardTaskLabel label;

  @override
  Widget build(BuildContext context) {
    final color = parseTaskLabelColor(label.color);
    final resolvedLabel = _taskLabelName(label);
    if (resolvedLabel == null) {
      return const SizedBox.shrink();
    }

    if (color == null) {
      return shad.OutlineBadge(child: Text(resolvedLabel));
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(28),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(180)),
      ),
      child: Text(
        resolvedLabel,
        style: shad.Theme.of(context).typography.small.copyWith(
          fontSize: 11,
          color: color.withAlpha(240),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ProjectBadge extends StatelessWidget {
  const _ProjectBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return shad.OutlineBadge(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.workspaces_outline, size: 12),
          const shad.Gap(4),
          Text(label),
        ],
      ),
    );
  }
}

class _AssigneeAvatarStack extends StatelessWidget {
  const _AssigneeAvatarStack({required this.assignees});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    final visible = assignees.take(3).toList(growable: false);
    final overflowCount = assignees.length - visible.length;
    // Width: first avatar is 20px, each additional adds 14px (with 6px overlap)
    final width = visible.length * 14 + 6 + (overflowCount > 0 ? 14 : 0);
    Widget child = SizedBox(
      height: 20,
      width: width.toDouble(),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < visible.length; i++)
            Positioned(
              left: i * 14,
              child: _AssigneeAvatar(assignee: visible[i]),
            ),
          if (overflowCount > 0)
            Positioned(
              left: visible.length * 14,
              child: _AssigneeOverflowAvatar(count: overflowCount),
            ),
        ],
      ),
    );

    if (overflowCount > 0) {
      child = Tooltip(
        message: context.l10n.taskBoardDetailTaskAssigneeCount(
          assignees.length,
        ),
        child: child,
      );
    }

    return child;
  }
}

class _AssigneeAvatar extends StatelessWidget {
  const _AssigneeAvatar({required this.assignee});

  final TaskBoardTaskAssignee assignee;

  @override
  Widget build(BuildContext context) {
    final name = (assignee.displayName?.trim().isNotEmpty == true)
        ? assignee.displayName!.trim()
        : assignee.id;
    final avatarUrl = assignee.avatarUrl?.trim() ?? '';
    final hasAvatar = avatarUrl.isNotEmpty;
    final fallback = Text(
      name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
      style: const TextStyle(fontSize: 9),
    );

    if (!hasAvatar) {
      return CircleAvatar(radius: 10, child: fallback);
    }

    return CircleAvatar(
      radius: 10,
      backgroundImage: NetworkImage(avatarUrl),
      onBackgroundImageError: (error, stackTrace) {},
    );
  }
}

class _AssigneeOverflowAvatar extends StatelessWidget {
  const _AssigneeOverflowAvatar({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 10,
      child: Text(
        '+$count',
        style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600),
      ),
    );
  }
}
