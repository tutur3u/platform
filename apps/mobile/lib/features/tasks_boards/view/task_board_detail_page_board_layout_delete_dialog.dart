part of 'task_board_detail_page.dart';

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
            Text(title, style: theme.typography.h4),
            const shad.Gap(12),
            Text(
              description,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(20),
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(cancelLabel),
            ),
            const shad.Gap(8),
            shad.DestructiveButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(confirmLabel),
            ),
          ],
        ),
      ),
    );
  }
}
