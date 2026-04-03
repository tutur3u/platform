part of 'task_board_detail_page.dart';

typedef _TaskSortField = ({String field, bool ascending});

class _TaskBoardEnhancedListView extends StatefulWidget {
  const _TaskBoardEnhancedListView({
    required this.boardId,
    required this.lists,
    required this.tasks,
    required this.state,
    required this.board,
    required this.bottomPadding,
    required this.scrollController,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onLoadMore,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final double bottomPadding;
  final ScrollController scrollController;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onLoadMore;

  @override
  State<_TaskBoardEnhancedListView> createState() =>
      _TaskBoardEnhancedListViewState();
}

class _TaskBoardEnhancedListViewState
    extends State<_TaskBoardEnhancedListView> {
  _TaskSortField _sort = (field: 'created_at', ascending: false);

  List<TaskBoardTask> get _sortedTasks {
    final sorted = List<TaskBoardTask>.from(widget.tasks)
      ..sort((a, b) {
        final aCompleted = a.closedAt != null;
        final bCompleted = b.closedAt != null;

        if (aCompleted != bCompleted) {
          return aCompleted ? 1 : -1;
        }

        var comparison = 0;

        switch (_sort.field) {
          case 'name':
            comparison = (a.name ?? '').compareTo(b.name ?? '');
          case 'priority':
            comparison = _priorityValue(
              a.priority,
            ).compareTo(_priorityValue(b.priority));
          case 'start_date':
            comparison = _dateValue(
              a.startDate,
            ).compareTo(_dateValue(b.startDate));
          case 'end_date':
            comparison = _dateValue(a.endDate).compareTo(_dateValue(b.endDate));
          case 'created_at':
            comparison = _dateValue(
              a.createdAt,
            ).compareTo(_dateValue(b.createdAt));
          case 'assignees':
            comparison = a.assignees.length.compareTo(b.assignees.length);
        }

        return _sort.ascending ? comparison : -comparison;
      });

    return sorted;
  }

  int _priorityValue(String? priority) {
    return switch (priority?.toLowerCase()) {
      'critical' => 4,
      'high' => 3,
      'normal' => 2,
      'low' => 1,
      _ => 0,
    };
  }

  int _dateValue(DateTime? date) {
    return date?.millisecondsSinceEpoch ?? 0;
  }

  String _sortFieldLabel(String field) {
    return switch (field) {
      'name' => context.l10n.taskBoardDetailTaskTitleLabel,
      'priority' => context.l10n.taskBoardDetailPriority,
      'end_date' => context.l10n.taskBoardDetailTaskEndDate,
      'start_date' => context.l10n.taskBoardDetailTaskStartDate,
      'assignees' => context.l10n.taskBoardDetailTaskAssignees,
      'created_at' => context.l10n.taskBoardsCreatedAt,
      _ => field,
    };
  }

  void _showSortBottomSheet() {
    unawaited(
      showAdaptiveSheet<void>(
        context: context,
        builder: (context) => _SortBottomSheet(
          currentField: _sort.field,
          ascending: _sort.ascending,
          onSortSelected: (field, {required ascending}) {
            setState(() {
              _sort = (field: field, ascending: ascending);
            });
            Navigator.pop(context);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final sortedTasks = _sortedTasks;

    if (sortedTasks.isEmpty) {
      return ListView(
        key: PageStorageKey<String>(
          'task-board-enhanced-list-empty-${widget.boardId}',
        ),
        controller: widget.scrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
        children: [
          shad.Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.inbox_outlined,
                    size: 48,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(16),
                  Text(
                    context.l10n.taskBoardDetailNoTasksInList,
                    style: theme.typography.large,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      key: PageStorageKey<String>('task-board-enhanced-list-${widget.boardId}'),
      controller: widget.scrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
      itemCount: sortedTasks.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return _buildSortChip();
        }

        final taskIndex = index - 1;

        if (taskIndex >= sortedTasks.length) {
          if (widget.state.filteredTasks.length > sortedTasks.length) {
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Center(
                child: shad.OutlineButton(
                  onPressed: widget.onLoadMore,
                  child: Text(context.l10n.timerHistoryLoadMore),
                ),
              ),
            );
          }
          return const SizedBox.shrink();
        }

        final task = sortedTasks[taskIndex];
        final isLast = taskIndex == sortedTasks.length - 1;

        return _TaskCard(
          task: task,
          board: widget.board,
          lists: widget.lists,
          isLast: isLast,
          onTap: () => widget.onTaskTap(task),
          onMove: () => widget.onTaskMove(task),
        );
      },
    );
  }

  Widget _buildSortChip() {
    final theme = shad.Theme.of(context);
    final sortLabel = _sortFieldLabel(_sort.field);
    final isAscending = _sort.ascending;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: _showSortBottomSheet,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.sort,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
              const shad.Gap(6),
              Text(
                'Sort: $sortLabel',
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w500,
                  color: theme.colorScheme.foreground,
                ),
              ),
              const shad.Gap(4),
              Icon(
                isAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 14,
                color: theme.colorScheme.primary,
              ),
              const shad.Gap(4),
              Icon(
                Icons.expand_more,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SortBottomSheet extends StatelessWidget {
  const _SortBottomSheet({
    required this.currentField,
    required this.ascending,
    required this.onSortSelected,
  });

  final String currentField;
  final bool ascending;
  final void Function(String field, {required bool ascending}) onSortSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 16),
            decoration: BoxDecoration(
              color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text(
                  'Sort by',
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const shad.Divider(),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskTitleLabel,
            field: 'name',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailPriority,
            field: 'priority',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskEndDate,
            field: 'end_date',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardDetailTaskAssignees,
            field: 'assignees',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          _SortOption(
            label: context.l10n.taskBoardsCreatedAt,
            field: 'created_at',
            currentField: currentField,
            ascending: ascending,
            onTap: onSortSelected,
          ),
          const shad.Gap(16),
        ],
      ),
    );
  }
}

class _SortOption extends StatelessWidget {
  const _SortOption({
    required this.label,
    required this.field,
    required this.currentField,
    required this.ascending,
    required this.onTap,
  });

  final String label;
  final String field;
  final String currentField;
  final bool ascending;
  final void Function(String field, {required bool ascending}) onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isSelected = currentField == field;

    return InkWell(
      onTap: () => onTap(field, ascending: !(isSelected && ascending)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: theme.typography.p.copyWith(
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  color: isSelected
                      ? theme.colorScheme.primary
                      : theme.colorScheme.foreground,
                ),
              ),
            ),
            if (isSelected)
              Icon(
                ascending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 18,
                color: theme.colorScheme.primary,
              ),
          ],
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({
    required this.task,
    required this.board,
    required this.lists,
    required this.isLast,
    required this.onTap,
    required this.onMove,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final bool isLast;
  final VoidCallback onTap;
  final VoidCallback onMove;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final list = lists.firstWhere(
      (l) => l.id == task.listId,
      orElse: () => TaskBoardList(
        id: task.listId,
        boardId: board.id,
        name: 'Unknown',
      ),
    );
    final listStyle = _taskBoardListVisualStyle(context, list);
    final isOverdue = _taskIsOverdue(task);
    final isCompleted = task.closedAt != null;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Material(
          color: theme.colorScheme.card,
          child: InkWell(
            onTap: onTap,
            child: Container(
              decoration: BoxDecoration(
                border: Border(
                  left: BorderSide(
                    color: listStyle.accent.withValues(alpha: 0.8),
                    width: 4,
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _TaskStatusIcon(task: task),
                        const shad.Gap(12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  shad.OutlineBadge(
                                    child: Text(
                                      _taskReference(task, board),
                                      style: theme.typography.small.copyWith(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const shad.Gap(8),
                                  Expanded(
                                    child: Text(
                                      task.name?.trim().isNotEmpty == true
                                          ? task.name!.trim()
                                          : context
                                                .l10n
                                                .taskBoardDetailUntitledTask,
                                      style: theme.typography.large.copyWith(
                                        fontWeight: FontWeight.w600,
                                        decoration: isCompleted
                                            ? TextDecoration.lineThrough
                                            : null,
                                        color: isCompleted
                                            ? theme.colorScheme.mutedForeground
                                            : theme.colorScheme.foreground,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              if (task.labels.isNotEmpty) ...[
                                const shad.Gap(8),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: task.labels
                                      .take(3)
                                      .map(
                                        (label) =>
                                            _CompactLabelChip(label: label),
                                      )
                                      .toList(),
                                ),
                              ],
                            ],
                          ),
                        ),
                        _TaskMoreButton(onTap: onTap, onMove: onMove),
                      ],
                    ),
                    const shad.Gap(12),
                    const Divider(height: 1),
                    const shad.Gap(12),
                    Row(
                      children: [
                        _PriorityBadge(priority: task.priority),
                        const shad.Gap(8),
                        if (task.endDate != null) ...[
                          Expanded(
                            child: _DueDateDisplay(
                              endDate: task.endDate,
                              isOverdue: isOverdue,
                              isCompleted: isCompleted,
                            ),
                          ),
                        ],
                        if (task.assignees.isNotEmpty) ...[
                          const shad.Gap(8),
                          _ListViewAssigneeAvatarStack(
                            assignees: task.assignees,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskStatusIcon extends StatelessWidget {
  const _TaskStatusIcon({required this.task});

  final TaskBoardTask task;

  @override
  Widget build(BuildContext context) {
    final colors = context.dynamicColors;

    if (task.closedAt != null) {
      return Icon(
        Icons.check_circle,
        color: colors.green,
        size: 22,
      );
    }

    if (task.completed == true) {
      return Icon(
        Icons.check_circle_outline,
        color: colors.yellow,
        size: 22,
      );
    }

    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
          width: 2,
        ),
      ),
    );
  }
}

class _CompactLabelChip extends StatelessWidget {
  const _CompactLabelChip({required this.label});

  final TaskBoardTaskLabel label;

  @override
  Widget build(BuildContext context) {
    final color = parseTaskLabelColor(label.color);
    final resolvedLabel = _taskLabelName(label);

    if (resolvedLabel == null) {
      return const SizedBox.shrink();
    }

    if (color == null) {
      return shad.OutlineBadge(
        child: Text(
          resolvedLabel,
          style: const TextStyle(fontSize: 10),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(180)),
      ),
      child: Text(
        resolvedLabel,
        style: shad.Theme.of(context).typography.small.copyWith(
          fontSize: 10,
          color: color.withAlpha(240),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _TaskMoreButton extends StatelessWidget {
  const _TaskMoreButton({required this.onTap, required this.onMove});

  final VoidCallback onTap;
  final VoidCallback onMove;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 32,
      height: 32,
      child: shad.IconButton.ghost(
        icon: const Icon(Icons.more_horiz, size: 20),
        onPressed: () {
          unawaited(
            showAdaptiveSheet<void>(
              context: context,
              builder: (context) => SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(top: 12, bottom: 8),
                      decoration: BoxDecoration(
                        color: shad.Theme.of(
                          context,
                        ).colorScheme.muted.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    ListTile(
                      leading: const Icon(Icons.open_in_new),
                      title: Text(context.l10n.taskBoardDetailEditTask),
                      onTap: () {
                        Navigator.pop(context);
                        onTap();
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.drive_file_move_outline),
                      title: Text(context.l10n.taskBoardDetailMoveTask),
                      onTap: () {
                        Navigator.pop(context);
                        onMove();
                      },
                    ),
                    const shad.Gap(8),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({this.priority});

  final String? priority;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final style = _taskPriorityStyle(context, priority);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: style.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 12, color: style.foreground),
          const shad.Gap(4),
          Text(
            style.label,
            style: theme.typography.small.copyWith(
              color: style.foreground,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _DueDateDisplay extends StatelessWidget {
  const _DueDateDisplay({
    required this.endDate,
    required this.isOverdue,
    required this.isCompleted,
  });

  final DateTime? endDate;
  final bool isOverdue;
  final bool isCompleted;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    if (endDate == null) {
      return const SizedBox.shrink();
    }

    final color = isOverdue && !isCompleted
        ? const Color(0xFFDC2626)
        : theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.calendar_today_outlined,
          size: 12,
          color: color,
        ),
        const shad.Gap(4),
        Flexible(
          child: Text(
            _formatShortDate(context, endDate!),
            style: theme.typography.small.copyWith(
              fontSize: 11,
              color: color,
              fontWeight: isOverdue && !isCompleted
                  ? FontWeight.w600
                  : FontWeight.normal,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (isOverdue && !isCompleted) ...[
          const shad.Gap(6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFFDC2626),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              context.l10n.taskBoardDetailOverdue,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ],
    );
  }

  String _formatShortDate(BuildContext context, DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(date.year, date.month, date.day);
    final diff = target.difference(today).inDays;

    if (diff == 0) return context.l10n.taskBoardDetailToday;
    if (diff == 1) return context.l10n.taskBoardDetailTomorrow;
    if (diff == -1) return context.l10n.taskBoardDetailYesterday;

    return DateFormat('MMM d').format(date);
  }
}

class _ListViewAssigneeAvatarStack extends StatelessWidget {
  const _ListViewAssigneeAvatarStack({required this.assignees});

  final List<TaskBoardTaskAssignee> assignees;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final visible = assignees.take(3).toList(growable: false);
    final overflowCount = assignees.length - visible.length;
    Widget child = SizedBox(
      height: 20,
      width: visible.length * 14 + 14,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < visible.length; i++)
            Positioned(
              left: i * 14,
              child: _ListViewAssigneeAvatar(assignee: visible[i]),
            ),
          if (overflowCount > 0)
            Positioned(
              left: visible.length * 14,
              child: Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: theme.colorScheme.muted.withValues(alpha: 0.4),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '+$overflowCount',
                    style: theme.typography.small.copyWith(
                      fontSize: 8,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
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

class _ListViewAssigneeAvatar extends StatelessWidget {
  const _ListViewAssigneeAvatar({required this.assignee});

  final TaskBoardTaskAssignee assignee;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colors = context.dynamicColors;
    final name = (assignee.displayName?.trim().isNotEmpty == true)
        ? assignee.displayName!.trim()
        : assignee.id;
    final avatarUrl = assignee.avatarUrl?.trim() ?? '';
    final hasAvatar = avatarUrl.isNotEmpty;

    final initials = name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?';

    final avatarColor = colors.blue;

    if (hasAvatar) {
      return Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: theme.colorScheme.card,
            width: 2,
          ),
        ),
        child: ClipOval(
          child: Image.network(
            avatarUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => ColoredBox(
              color: avatarColor,
              child: Center(
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: avatarColor,
        border: Border.all(
          color: theme.colorScheme.card,
          width: 2,
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
