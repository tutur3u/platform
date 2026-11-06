part of 'task_board_detail_page.dart';

class _TaskSelectionToggle extends StatelessWidget {
  const _TaskSelectionToggle({
    required this.isSelected,
    required this.listStyle,
    required this.onPressed,
  });

  final bool isSelected;
  final _TaskBoardListVisualStyle listStyle;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Semantics(
      button: true,
      checked: isSelected,
      child: InkResponse(
        onTap: onPressed,
        radius: 22,
        child: SizedBox.square(
          dimension: 21,
          child: Center(
            child: Icon(
              isSelected ? Icons.check_box : Icons.check_box_outline_blank,
              size: 19,
              color: isSelected
                  ? listStyle.accent
                  : theme.colorScheme.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskCompletionToggle extends StatelessWidget {
  const _TaskCompletionToggle({
    required this.task,
    required this.list,
    required this.listStyle,
    required this.targetStatus,
    required this.enabled,
    required this.onPressed,
  });

  final TaskBoardTask task;
  final TaskBoardList list;
  final _TaskBoardListVisualStyle listStyle;
  final String targetStatus;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.dynamicColors;
    final normalizedStatus = TaskBoardList.normalizeSupportedStatus(
      list.status,
    );
    final isChecked =
        normalizedStatus == 'done' ||
        normalizedStatus == 'closed' ||
        task.closedAt != null;

    return Tooltip(
      message: _taskBoardListStatusLabel(context, targetStatus),
      child: Semantics(
        button: true,
        checked: isChecked,
        child: InkResponse(
          onTap: enabled ? onPressed : null,
          radius: 22,
          child: SizedBox.square(
            dimension: 21,
            child: Center(
              child: Icon(
                isChecked ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 19,
                color: isChecked
                    ? colors.green
                    : listStyle.accent.withValues(alpha: enabled ? 0.82 : 0.42),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
