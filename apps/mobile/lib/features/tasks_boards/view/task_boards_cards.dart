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
    final accentColor = board.isRecentlyDeleted
        ? theme.colorScheme.destructive
        : board.isArchived
        ? const Color(0xFFF59E0B)
        : theme.colorScheme.primary;

    return TaskSurfacePane(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accentColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    resolvePlatformIcon(board.icon),
                    size: 22,
                    color: accentColor,
                  ),
                ),
                const shad.Gap(12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        board.name ?? context.l10n.taskEstimatesUnnamedBoard,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (board.ticketPrefix?.trim().isNotEmpty == true) ...[
                        const shad.Gap(4),
                        Text(
                          board.ticketPrefix!.trim(),
                          style: theme.typography.xSmall.copyWith(
                            letterSpacing: 0.8,
                            fontWeight: FontWeight.w700,
                            color: accentColor,
                          ),
                        ),
                      ],
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
            const shad.Gap(14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                shad.OutlineBadge(
                  child: Text(
                    context.l10n.taskBoardsListsCount(board.listCount),
                  ),
                ),
                shad.OutlineBadge(
                  child: Text(
                    context.l10n.taskBoardsTasksCount(board.taskCount),
                  ),
                ),
                if (board.isArchived)
                  shad.OutlineBadge(
                    child: Text(context.l10n.taskBoardsArchived),
                  ),
                if (board.isRecentlyDeleted)
                  shad.OutlineBadge(
                    child: Text(context.l10n.taskBoardsRecentlyDeleted),
                  ),
              ],
            ),
            const shad.Gap(14),
            Row(
              children: [
                const Spacer(),
                Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: accentColor,
                ),
              ],
            ),
          ],
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
