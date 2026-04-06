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

    final hasClosedList = !_taskBoardCanCreateListInStatus(
      board.lists,
      'closed',
    );

    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
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
            shad.GhostButton(
              onPressed: onClose,
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.close_rounded, size: 20),
            ),
          ],
        ),
        const shad.Gap(20),
        for (var index = 0; index < statuses.length; index++) ...[
          if (index > 0) const Divider(height: 32),
          Builder(
            builder: (context) {
              final status = statuses[index];
              final statusLists = _sortedLists(
                board.lists
                    .where(
                      (list) =>
                          (TaskBoardList.normalizeSupportedStatus(
                                list.status,
                              ) ??
                              'active') ==
                          status,
                    )
                    .toList(growable: false),
              );

              return _TaskBoardBoardLayoutStatusSection(
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
        ],
      ],
    );
  }
}
