part of 'task_board_detail_page.dart';

class _TaskBoardBoardLayoutSheet extends StatelessWidget {
  const _TaskBoardBoardLayoutSheet({
    required this.board,
    required this.onClose,
    required this.onCreateListForStatus,
    required this.onMoveListUp,
    required this.onMoveListDown,
    required this.onListActions,
  });

  final TaskBoardDetail board;
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
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.taskBoardDetailManageBoardLayout,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w700),
          ),
          const shad.Gap(6),
          Text(
            context.l10n.taskBoardDetailManageBoardLayoutDescription,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          Flexible(
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: statuses.length,
              separatorBuilder: (_, _) => const shad.Gap(14),
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
                  onCreateListForStatus: onCreateListForStatus,
                  onMoveListUp: onMoveListUp,
                  onMoveListDown: onMoveListDown,
                  onListActions: onListActions,
                );
              },
            ),
          ),
          const shad.Gap(10),
          Align(
            alignment: Alignment.centerRight,
            child: shad.PrimaryButton(
              onPressed: onClose,
              child: Text(context.l10n.taskBoardDetailSearchDone),
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
  final Future<void> Function(String status) onCreateListForStatus;
  final Future<void> Function(TaskBoardList list) onMoveListUp;
  final Future<void> Function(TaskBoardList list) onMoveListDown;
  final Future<void> Function(TaskBoardList list) onListActions;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(this.context);
    final canCreateInStatus = status != 'closed' || !hasClosedList;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              _taskBoardListStatusIcon(status),
              size: 16,
              color: _taskBoardListStatusBadgeColors(
                this.context,
                status,
              ).textColor,
            ),
            const shad.Gap(8),
            Text(
              _taskBoardListStatusLabel(this.context, status),
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const shad.Gap(8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.muted,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$listCount',
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ),
            const Spacer(),
            shad.OutlineButton(
              onPressed: canCreateInStatus
                  ? () => unawaited(onCreateListForStatus(status))
                  : null,
              density: shad.ButtonDensity.compact,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add, size: 14),
                  const shad.Gap(6),
                  Text(this.context.l10n.taskBoardDetailAddNewList),
                ],
              ),
            ),
          ],
        ),
        const shad.Gap(8),
        if (lists.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.muted,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.colorScheme.border),
            ),
            child: Text(
              this.context.l10n.taskBoardDetailNoListsInStatus,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          )
        else
          Column(
            children: lists
                .map(
                  (list) => _TaskBoardBoardLayoutListCard(
                    context: this.context,
                    list: list,
                    onMoveUp: () => unawaited(onMoveListUp(list)),
                    onMoveDown: () => unawaited(onMoveListDown(list)),
                    onMore: () => unawaited(onListActions(list)),
                  ),
                )
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
    required this.onMoveUp,
    required this.onMoveDown,
    required this.onMore,
  });

  final BuildContext context;
  final TaskBoardList list;
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
        subtitle: Text(
          listStyle.statusLabel,
          style: theme.typography.small.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            shad.GhostButton(
              onPressed: onMoveUp,
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.arrow_upward_rounded, size: 16),
            ),
            shad.GhostButton(
              onPressed: onMoveDown,
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.arrow_downward_rounded, size: 16),
            ),
            shad.GhostButton(
              onPressed: onMore,
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.more_horiz_rounded, size: 16),
            ),
          ],
        ),
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
