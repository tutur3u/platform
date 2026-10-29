part of 'task_board_detail_page.dart';

/// Opens the tap-to-edit quick sheet and runs its edits through the same
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
    final assignBoard = _taskRowAssignBoard(context);
    final board = cubit.state.board;
    final canMove = lists.any((list) => list.id != task.listId);
    BuildContext? sheetContext;

    // Status, move and full details leave the sheet; field edits keep it
    // open so several can be made in a row.
    void closeThen(Future<void> Function() action) {
      final current = sheetContext;
      if (current != null && current.mounted) {
        final scope = AppModalScope.maybeOf(current);
        if (scope != null) unawaited(scope.close());
      }
      unawaited(action());
    }

    // Edits save quietly: the sheet shows the new value in place, and a
    // toast would cover the next picker. Failures still show a toast.
    // The board runs one mutation at a time; an edit tapped while another
    // saves is dropped rather than failing. The sheet also disables its
    // controls while the cubit is busy.
    void whenIdle(Future<void> Function() action) {
      if (cubit.state.isMutating) return;
      unawaited(action());
    }

    final callbacks = _TaskQuickActionCallbacks(
      onStatus: (task, status) {
        if (cubit.state.isMutating) return;
        closeThen(() => _markTaskAsStatus(context, task, lists, status));
      },
      onPriority: (task, priority) => whenIdle(
        () => _changeTaskPriority(context, task, priority, announce: false),
      ),
      onPickDate: (task, field) =>
          whenIdle(() => _pickTaskQuickDate(context, task, field)),
      onClearDate: (task, field) =>
          whenIdle(() => _clearTaskQuickDate(context, task, field)),
      onOpenDetails: (task) => closeThen(() => _openTaskDetails(context, task)),
      onAssignees: assignBoard == null
          ? null
          : (task) => whenIdle(
              () => _pickTaskAssignees(
                context,
                task,
                assignBoard,
                announce: false,
              ),
            ),
      onLabels: board == null || board.labels.isEmpty
          ? null
          : (task) => whenIdle(() => _pickTaskLabels(context, task, board)),
      onMove: canMove
          ? (task) => closeThen(() => _openMoveTaskPicker(context, task, lists))
          : null,
    );

    await showAppSheet<void>(
      context: context,
      builder: (innerContext) {
        sheetContext = innerContext;
        return MultiBlocProvider(
          providers: [
            BlocProvider.value(value: cubit),
            if (timezone != null) BlocProvider.value(value: timezone),
          ],
          child: _TaskQuickActionsSheet(
            task: task,
            lists: lists,
            callbacks: callbacks,
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
