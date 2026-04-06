part of 'task_board_detail_page.dart';

class _TaskBoardBoardLayoutListCard extends StatelessWidget {
  const _TaskBoardBoardLayoutListCard({
    required this.list,
    required this.canMoveUp,
    required this.canMoveDown,
    required this.onMoveUp,
    required this.onMoveDown,
    required this.onMore,
  });

  final TaskBoardList list;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final rawListName = list.name?.trim();
    final listName = rawListName != null && rawListName.isNotEmpty
        ? rawListName
        : context.l10n.taskBoardDetailUntitledList;
    final listStyle = _taskBoardListVisualStyle(context, list);

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
              canMove: canMoveUp,
              onPressed: canMoveUp ? onMoveUp : null,
              icon: Icons.arrow_upward_rounded,
              tooltip: context.l10n.taskBoardDetailMoveListUp,
            ),
            _BoardLayoutMoveButton(
              canMove: canMoveDown,
              onPressed: canMoveDown ? onMoveDown : null,
              icon: Icons.arrow_downward_rounded,
              tooltip: context.l10n.taskBoardDetailMoveListDown,
            ),
            _BoardLayoutActionButton(
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
    required this.canMove,
    required this.onPressed,
    required this.icon,
    required this.tooltip,
  });

  final bool canMove;
  final VoidCallback? onPressed;
  final IconData icon;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

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
    required this.onPressed,
    required this.icon,
  });

  final VoidCallback onPressed;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

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
