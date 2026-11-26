part of 'task_board_detail_page.dart';

enum _BoardAction {
  sortList,
  manageLayout,
  renameBoard,
  share,
  recycleBin,
  refresh,
}

/// The board's actions sheet and what each action opens.
extension _TaskBoardMenu on _TaskBoardDetailPageViewState {
  Future<void> _showBoardActionsSheet(BuildContext context) async {
    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (context.read<TaskBoardDetailCubit>().state.currentView ==
                    TaskBoardDetailView.list)
                  ListTile(
                    leading: const Icon(Icons.sort),
                    title: Text(context.l10n.sortBy),
                    subtitle: Text(
                      taskBoardListViewSortFieldLabel(
                        context,
                        _viewSettings.sort.field,
                      ),
                    ),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _handleBoardAction(context, _BoardAction.sortList);
                    },
                  ),
                ListTile(
                  leading: const Icon(Icons.view_kanban_outlined),
                  title: Text(context.l10n.taskBoardDetailManageBoardLayout),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.manageLayout);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: Text(context.l10n.taskBoardDetailRenameBoard),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.renameBoard);
                  },
                ),
                ListTile(
                  key: const ValueKey('board-action-share'),
                  leading: const Icon(Icons.share_outlined),
                  title: Text(context.l10n.boardShareAction),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.share);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.refresh_rounded),
                  title: Text(context.l10n.taskBoardDetailRefresh),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.refresh);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.delete_outline_rounded),
                  title: Text(context.l10n.taskBoardDetailRecycleBin),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.recycleBin);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _handleBoardAction(BuildContext context, _BoardAction action) {
    switch (action) {
      case _BoardAction.sortList:
        unawaited(_openListSortSheet(context));
        return;
      case _BoardAction.manageLayout:
        unawaited(_openBoardLayoutSheet(context));
        return;
      case _BoardAction.renameBoard:
        unawaited(_openRenameBoardDialog(context));
        return;
      case _BoardAction.share:
        final board = context.read<TaskBoardDetailCubit>().state.board;
        if (board == null) return;
        unawaited(
          showBoardShareSheet(
            context,
            wsId: board.wsId,
            boardId: board.id,
            boardName: board.name?.trim() ?? '',
          ),
        );
        return;
      case _BoardAction.refresh:
        unawaited(context.read<TaskBoardDetailCubit>().reload());
        return;
      case _BoardAction.recycleBin:
        unawaited(_openRecycleBinSheet(context));
        return;
    }
  }
}
