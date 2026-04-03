part of 'task_board_detail_page.dart';

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
    final theme = shad.Theme.of(context);

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
              context.l10n.taskBoardDetailListActions,
              style: theme.typography.h4,
            ),
            const shad.Gap(16),
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
      ),
    );
  }
}
