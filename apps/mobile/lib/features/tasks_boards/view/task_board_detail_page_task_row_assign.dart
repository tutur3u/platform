part of 'task_board_detail_page.dart';

/// The Assignees action of the shared task context menu, reusing the bulk
/// actions' member selection sheet for a single task.
extension _TaskRowAssign on _TaskBoardDetailPageViewState {
  /// The board whose members a task can be assigned to, or null when the
  /// menu offers no Assignees action: personal workspaces and boards without
  /// members.
  TaskBoardDetail? _taskRowAssignBoard(BuildContext context) {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null || board.members.isEmpty) return null;
    if (_isPersonalWorkspaceForBoard(context, board)) return null;
    return board;
  }

  Future<void> _pickTaskAssignees(
    BuildContext context,
    TaskBoardTask task,
    TaskBoardDetail board,
  ) async {
    final current = task.assigneeIds.toSet();
    final selected = await showAdaptiveSheet<Set<String>>(
      context: context,
      builder: (_) => _FilterSelectionSheet(
        title: context.l10n.taskBoardDetailTaskAssignees,
        options: [
          for (final member in board.members)
            _FilterMenuOption(
              id: member.id,
              label: member.label,
              avatarUrl: member.avatarUrl,
            ),
        ],
        initialSelectedIds: current,
      ),
    );
    if (selected == null || !context.mounted) return;
    if (selected.length == current.length && selected.containsAll(current)) {
      return;
    }
    await _runTaskRowUpdate(
      context,
      task,
      successMessage: context.l10n.taskBoardDetailTaskSaved,
      assigneeIds: selected.toList(growable: false),
    );
  }
}
