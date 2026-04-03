part of 'task_board_detail_page.dart';

class _TaskBoardBoardLayoutSheet extends StatelessWidget {
  const _TaskBoardBoardLayoutSheet({
    required this.board,
    required this.isMutating,
    required this.onClose,
    required this.onCreateListForStatus,
    required this.onMoveListUp,
    required this.onMoveListDown,
    required this.onListActions,
  });

  final TaskBoardDetail board;
  final bool isMutating;
  final VoidCallback onClose;
  final Future<void> Function(String status) onCreateListForStatus;
  final Future<void> Function(TaskBoardList list) onMoveListUp;
  final Future<void> Function(TaskBoardList list) onMoveListDown;
  final Future<void> Function(TaskBoardList list) onListActions;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    const statuses = <String>[
      'documents',
      'not_started',
      'active',
      'done',
      'closed',
    ];

    final hasClosedList = board.lists.any(
      (list) => TaskBoardList.normalizeSupportedStatus(list.status) == 'closed',
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header section with better spacing
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.taskBoardDetailManageBoardLayout,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      context.l10n.taskBoardDetailManageBoardLayoutDescription,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              // Close button moved to header for better accessibility
              shad.GhostButton(
                onPressed: onClose,
                density: shad.ButtonDensity.icon,
                child: const Icon(Icons.close_rounded, size: 20),
              ),
            ],
          ),
          const shad.Gap(20),
          // Status sections
          Flexible(
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: statuses.length,
              separatorBuilder: (_, _) => const Divider(height: 32),
              itemBuilder: (context, index) {
                final status = statuses[index];
                final statusLists = _sortedLists(
                  board.lists
                      .where(
                        (list) =>
                            TaskBoardList.normalizeSupportedStatus(
                              list.status,
                            ) ==
                            status,
                      )
                      .toList(growable: false),
                );

                return _TaskBoardBoardLayoutStatusSection(
                  context: context,
                  status: status,
                  listCount: statusLists.length,
                  lists: statusLists,
                  hasClosedList: hasClosedList,
                  isMutating: isMutating,
                  onCreateListForStatus: onCreateListForStatus,
                  onMoveListUp: onMoveListUp,
                  onMoveListDown: onMoveListDown,
                  onListActions: onListActions,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskBoardBoardLayoutStatusSection extends StatelessWidget {
  const _TaskBoardBoardLayoutStatusSection({
    required this.context,
    required this.status,
    required this.listCount,
    required this.lists,
    required this.hasClosedList,
    required this.isMutating,
    required this.onCreateListForStatus,
    required this.onMoveListUp,
    required this.onMoveListDown,
    required this.onListActions,
  });

  final BuildContext context;
  final String status;
  final int listCount;
  final List<TaskBoardList> lists;
  final bool hasClosedList;
  final bool isMutating;
  final Future<void> Function(String status) onCreateListForStatus;
  final Future<void> Function(TaskBoardList list) onMoveListUp;
  final Future<void> Function(TaskBoardList list) onMoveListDown;
  final Future<void> Function(TaskBoardList list) onListActions;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);
    final canCreateInStatus = status != 'closed' || !hasClosedList;
    final statusColors = _taskBoardListStatusBadgeColors(this.context, status);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Improved header: more compact and better visual hierarchy
        Row(
          children: [
            // Status icon with colored background
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: statusColors.backgroundColor,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _taskBoardListStatusIcon(status),
                size: 14,
                color: statusColors.textColor,
              ),
            ),
            const shad.Gap(10),
            // Status name
            Expanded(
              child: Text(
                _taskBoardListStatusLabel(this.context, status),
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            // Compact count badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.muted.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$listCount',
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const shad.Gap(8),
            // Icon-only add button to save space
            shad.GhostButton(
              onPressed: (!isMutating && canCreateInStatus)
                  ? () => unawaited(onCreateListForStatus(status))
                  : null,
              density: shad.ButtonDensity.icon,
              child: Icon(
                Icons.add_rounded,
                size: 18,
                color: (!isMutating && canCreateInStatus)
                    ? theme.colorScheme.primary
                    : theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
        const shad.Gap(10),
        // Lists or empty state
        if (lists.isEmpty)
          _TaskBoardBoardLayoutEmptyState(context: this.context)
        else
          Column(
            children: lists
                .asMap()
                .entries
                .map((entry) {
                  final index = entry.key;
                  final list = entry.value;
                  final canMoveUp = !isMutating && index > 0;
                  final canMoveDown = !isMutating && index < lists.length - 1;
                  return _TaskBoardBoardLayoutListCard(
                    context: this.context,
                    list: list,
                    canMoveUp: canMoveUp,
                    canMoveDown: canMoveDown,
                    onMoveUp: () => unawaited(onMoveListUp(list)),
                    onMoveDown: () => unawaited(onMoveListDown(list)),
                    onMore: () => unawaited(onListActions(list)),
                  );
                })
                .toList(growable: false),
          ),
      ],
    );
  }
}

class _TaskBoardBoardLayoutListCard extends StatelessWidget {
  const _TaskBoardBoardLayoutListCard({
    required this.context,
    required this.list,
    required this.canMoveUp,
    required this.canMoveDown,
    required this.onMoveUp,
    required this.onMoveDown,
    required this.onMore,
  });

  final BuildContext context;
  final TaskBoardList list;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);
    final rawListName = list.name?.trim();
    final listName = rawListName != null && rawListName.isNotEmpty
        ? rawListName
        : this.context.l10n.taskBoardDetailUntitledList;
    final listStyle = _taskBoardListVisualStyle(this.context, list);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: listStyle.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: listStyle.surfaceBorder),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        leading: Container(
          width: 8,
          height: 40,
          decoration: BoxDecoration(
            color: listStyle.accent,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        title: Text(
          listName,
          style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _BoardLayoutMoveButton(
              context: this.context,
              canMove: canMoveUp,
              onPressed: canMoveUp ? onMoveUp : null,
              icon: Icons.arrow_upward_rounded,
              tooltip: 'Move up',
            ),
            _BoardLayoutMoveButton(
              context: this.context,
              canMove: canMoveDown,
              onPressed: canMoveDown ? onMoveDown : null,
              icon: Icons.arrow_downward_rounded,
              tooltip: 'Move down',
            ),
            _BoardLayoutActionButton(
              context: this.context,
              onPressed: onMore,
              icon: Icons.more_horiz_rounded,
            ),
          ],
        ),
      ),
    );
  }
}

class _BoardLayoutMoveButton extends StatelessWidget {
  const _BoardLayoutMoveButton({
    required this.context,
    required this.canMove,
    required this.onPressed,
    required this.icon,
    required this.tooltip,
  });

  final BuildContext context;
  final bool canMove;
  final VoidCallback? onPressed;
  final IconData icon;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);

    return Tooltip(
      message: tooltip,
      child: shad.GhostButton(
        onPressed: onPressed,
        density: shad.ButtonDensity.icon,
        child: Icon(
          icon,
          size: 16,
          color: canMove
              ? theme.colorScheme.foreground
              : theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
        ),
      ),
    );
  }
}

class _BoardLayoutActionButton extends StatelessWidget {
  const _BoardLayoutActionButton({
    required this.context,
    required this.onPressed,
    required this.icon,
  });

  final BuildContext context;
  final VoidCallback onPressed;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);

    return shad.GhostButton(
      onPressed: onPressed,
      density: shad.ButtonDensity.icon,
      child: Icon(
        icon,
        size: 16,
        color: theme.colorScheme.foreground,
      ),
    );
  }
}

/// Compact empty state for status sections without lists
class _TaskBoardBoardLayoutEmptyState extends StatelessWidget {
  const _TaskBoardBoardLayoutEmptyState({required this.context});

  final BuildContext context;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.inbox_outlined,
            size: 16,
            color: theme.colorScheme.mutedForeground,
          ),
          const shad.Gap(8),
          Expanded(
            child: Text(
              this.context.l10n.taskBoardDetailNoListsInStatus,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskBoardListActionsDialog extends StatelessWidget {
  const _TaskBoardListActionsDialog({
    required this.onEdit,
    required this.onMove,
    required this.onDelete,
    required this.onCancel,
  });

  final VoidCallback onEdit;
  final VoidCallback onMove;
  final VoidCallback onDelete;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailListActions),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shad.OutlineButton(
            onPressed: onEdit,
            child: Text(context.l10n.taskBoardDetailEditList),
          ),
          const shad.Gap(8),
          shad.OutlineButton(
            onPressed: onMove,
            child: Text(context.l10n.taskBoardDetailMoveListToStatus),
          ),
          const shad.Gap(8),
          shad.DestructiveButton(
            onPressed: onDelete,
            child: Text(context.l10n.taskBoardDetailDeleteList),
          ),
          const shad.Gap(8),
          shad.GhostButton(
            onPressed: onCancel,
            child: Text(context.l10n.commonCancel),
          ),
        ],
      ),
    );
  }
}

class _TaskBoardMoveListStatusDialog extends StatelessWidget {
  const _TaskBoardMoveListStatusDialog({required this.currentStatus});

  final String currentStatus;

  @override
  Widget build(BuildContext context) {
    final statuses = TaskBoardList.supportedStatuses
        .where((status) => status != currentStatus && status != 'closed')
        .toList(growable: false);

    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailMoveListToStatus),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: statuses
            .map(
              (status) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(context).pop(status),
                  child: Text(_taskBoardListStatusLabel(context, status)),
                ),
              ),
            )
            .toList(growable: false),
      ),
      actions: [
        shad.GhostButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
    );
  }
}

class _TaskBoardDeleteListDialog extends StatelessWidget {
  const _TaskBoardDeleteListDialog({
    required this.title,
    required this.description,
    required this.cancelLabel,
    required this.confirmLabel,
  });

  final String title;
  final String description;
  final String cancelLabel;
  final String confirmLabel;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(title),
      content: Text(description),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(cancelLabel),
        ),
        shad.DestructiveButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    );
  }
}
