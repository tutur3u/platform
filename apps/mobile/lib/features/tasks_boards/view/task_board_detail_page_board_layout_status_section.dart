part of 'task_board_detail_page.dart';

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
        Row(
          children: [
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
            Expanded(
              child: Text(
                _taskBoardListStatusLabel(this.context, status),
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
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
