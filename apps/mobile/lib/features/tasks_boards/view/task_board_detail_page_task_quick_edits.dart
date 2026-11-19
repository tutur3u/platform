part of 'task_board_detail_page.dart';

/// Opens the task sheet a tap shows and runs its edits through the same
/// mutations as the row menu.
extension _TaskQuickEdits on _TaskBoardDetailPageViewState {
  Future<void> _openTaskQuickActionsSheet(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    // The sheet opens above the page; a page-scoped timezone setting is
    // passed down so it reads dates in the same zone as the board.
    final timezone = context.read<TimezoneSettingsCubit?>();
    final board = cubit.state.board;
    BuildContext? sheetContext;

    // Navigation and delete close the sheet before continuing.
    Future<void> closeSheet() async {
      final current = sheetContext;
      if (current == null || !current.mounted) return;
      await AppModalScope.maybeOf(current)?.close();
    }

    // Edits save quietly: the sheet shows the new value in place, and a
    // toast would cover the next picker. Failures still show a toast.
    final actions = _taskDetailActions(
      context,
      lists,
      closeOverlay: closeSheet,
    );

    await showAppSheet<void>(
      context: context,
      size: AppSheetSize.medium,
      builder: (innerContext) {
        sheetContext = innerContext;
        return MultiBlocProvider(
          providers: [
            BlocProvider.value(value: cubit),
            if (timezone != null) BlocProvider.value(value: timezone),
          ],
          child: _TaskDetailSheet(
            task: task,
            lists: lists,
            actions: actions,
            isPersonalWorkspace:
                board != null && _isPersonalWorkspaceForBoard(context, board),
          ),
        );
      },
    );
  }

  Future<void> _pickTaskLabels(
    BuildContext context,
    TaskBoardTask task,
    TaskBoardDetail board,
  ) async {
    final current = task.labelIds.toSet();
    final selected = await showAdaptiveSheet<Set<String>>(
      context: context,
      builder: (_) => _FilterSelectionSheet(
        title: context.l10n.taskBoardDetailTaskLabels,
        options: [
          for (final label in board.labels)
            _FilterMenuOption(
              id: label.id,
              label: label.name.trim().isEmpty ? label.id : label.name,
              kind: _FilterMenuOptionKind.label,
              color: parseTaskLabelColor(label.color),
            ),
        ],
        initialSelectedIds: current,
        applyLabel: context.l10n.commonSave,
        clearLabel: context.l10n.commonClear,
      ),
    );
    if (selected == null || !context.mounted) return;
    if (selected.length == current.length && selected.containsAll(current)) {
      return;
    }
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: null,
      labelIds: selected.toList(growable: false),
    );
  }
}
