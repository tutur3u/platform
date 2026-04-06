part of 'task_board_detail_page.dart';

class _TaskBoardBoardLayoutEmptyState extends StatelessWidget {
  const _TaskBoardBoardLayoutEmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

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
              context.l10n.taskBoardDetailNoListsInStatus,
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
