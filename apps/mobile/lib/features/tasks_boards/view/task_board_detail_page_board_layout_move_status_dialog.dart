part of 'task_board_detail_page.dart';

class _TaskBoardMoveListStatusDialog extends StatelessWidget {
  const _TaskBoardMoveListStatusDialog({required this.currentStatus});

  final String currentStatus;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final statuses = TaskBoardList.supportedStatuses
        .where((status) => status != currentStatus && status != 'closed')
        .toList(growable: false);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _TaskBoardPickerHandle(
              color: theme.colorScheme.mutedForeground,
            ),
            const shad.Gap(16),
            Text(
              context.l10n.taskBoardDetailMoveListToStatus,
              style: theme.typography.h4,
            ),
            const shad.Gap(16),
            ...statuses.map(
              (status) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(context).pop(status),
                  child: Text(_taskBoardListStatusLabel(context, status)),
                ),
              ),
            ),
            shad.GhostButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        ),
      ),
    );
  }
}
