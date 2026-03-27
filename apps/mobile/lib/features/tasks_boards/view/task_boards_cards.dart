part of 'task_boards_view.dart';

class _TaskBoardCard extends StatelessWidget {
  const _TaskBoardCard({
    required this.canManage,
    required this.board,
    required this.onTap,
    required this.onEdit,
    required this.onDuplicate,
    required this.onArchive,
    required this.onUnarchive,
    required this.onDelete,
    required this.onRestore,
    required this.onDeleteForever,
  });

  final bool canManage;
  final TaskBoardSummary board;
  final VoidCallback onTap;
  final VoidCallback onEdit;
  final VoidCallback onDuplicate;
  final VoidCallback onArchive;
  final VoidCallback onUnarchive;
  final VoidCallback onDelete;
  final VoidCallback onRestore;
  final VoidCallback onDeleteForever;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final createdLabel = board.createdAt == null
        ? '-'
        : DateFormat.yMMMd().format(board.createdAt!);
    final boardCounts =
        '${context.l10n.taskBoardsListsCount(board.listCount)} • '
        '${context.l10n.taskBoardsTasksCount(board.taskCount)}';

    return shad.Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(resolvePlatformIcon(board.icon), size: 20),
                  const shad.Gap(8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          board.name ?? context.l10n.taskEstimatesUnnamedBoard,
                          style: theme.typography.large.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const shad.Gap(4),
                        Text(
                          boardCounts,
                          style: theme.typography.textSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (canManage)
                    shad.IconButton.ghost(
                      icon: const Icon(Icons.more_horiz),
                      onPressed: () => _showActionMenu(context),
                    ),
                ],
              ),
              const shad.Gap(10),
              Text(
                '${context.l10n.taskBoardsCreatedAt}: $createdLabel',
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              if (board.isArchived) ...[
                const shad.Gap(8),
                shad.OutlineBadge(child: Text(context.l10n.taskBoardsArchived)),
              ],
              if (board.isRecentlyDeleted) ...[
                const shad.Gap(8),
                shad.OutlineBadge(
                  child: Text(context.l10n.taskBoardsRecentlyDeleted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showActionMenu(BuildContext context) {
    shad.showDropdown<void>(
      context: context,
      builder: (context) => shad.DropdownMenu(children: _menuButtons(context)),
    );
  }

  List<shad.MenuItem> _menuButtons(BuildContext context) {
    if (board.isRecentlyDeleted) {
      return [
        shad.MenuButton(
          onPressed: (context) => onRestore(),
          child: Text(context.l10n.taskBoardsRestore),
        ),
        shad.MenuButton(
          onPressed: (context) => onDeleteForever(),
          child: Text(context.l10n.taskBoardsDeleteForever),
        ),
      ];
    }

    if (board.isArchived) {
      return [
        shad.MenuButton(
          onPressed: (context) => onUnarchive(),
          child: Text(context.l10n.taskBoardsUnarchive),
        ),
        shad.MenuButton(
          onPressed: (context) => onDelete(),
          child: Text(context.l10n.taskBoardsDelete),
        ),
      ];
    }

    return [
      shad.MenuButton(
        onPressed: (context) => onEdit(),
        child: Text(context.l10n.taskBoardsEdit),
      ),
      shad.MenuButton(
        onPressed: (context) => onDuplicate(),
        child: Text(context.l10n.taskBoardsDuplicate),
      ),
      shad.MenuButton(
        onPressed: (context) => onArchive(),
        child: Text(context.l10n.taskBoardsArchive),
      ),
      shad.MenuButton(
        onPressed: (context) => onDelete(),
        child: Text(context.l10n.taskBoardsDelete),
      ),
    ];
  }
}
