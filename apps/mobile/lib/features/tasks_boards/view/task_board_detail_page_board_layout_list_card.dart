part of 'task_board_detail_page.dart';

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
              tooltip: this.context.l10n.taskBoardDetailMoveListUp,
            ),
            _BoardLayoutMoveButton(
              context: this.context,
              canMove: canMoveDown,
              onPressed: canMoveDown ? onMoveDown : null,
              icon: Icons.arrow_downward_rounded,
              tooltip: this.context.l10n.taskBoardDetailMoveListDown,
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
