part of 'task_board_detail_page.dart';

extension _TaskBoardChrome on _TaskBoardDetailPageViewState {
  Widget _boardChromeActions(
    BuildContext context,
    TaskBoardDetailState state, {
    required String route,
    required bool isPersonal,
  }) {
    final board = state.board;
    final l10n = context.l10n;
    final cubit = context.read<TaskBoardDetailCubit>();
    final lists = _sortedListsByStatusOrder(board?.lists ?? const []);
    final nextView = state.currentView == TaskBoardDetailView.kanban
        ? TaskBoardDetailView.list
        : TaskBoardDetailView.kanban;
    return ShellChromeActions(
      ownerId: 'task-board-detail-${widget.boardId}',
      locations: {route},
      actions: [
        ShellActionSpec(
          id: 'task-board-detail-create',
          icon: LucideIcons.plus,
          tooltip: l10n.taskBoardDetailCreateTask,
          inDock: true,
          filled: true,
          enabled: lists.isNotEmpty,
          onPressed: () => unawaited(
            _openTaskCreateSheet(
              context,
              lists: lists,
              defaultListId: _defaultCreateListId(lists, state),
            ),
          ),
        ),
        ShellActionSpec(
          id: 'task-board-detail-view',
          icon: nextView == TaskBoardDetailView.list
              ? LucideIcons.list
              : LucideIcons.columns3,
          tooltip: nextView == TaskBoardDetailView.list
              ? l10n.taskBoardDetailListView
              : l10n.taskBoardDetailKanbanView,
          enabled: board != null,
          onPressed: () {
            if (isPersonal) {
              _openBoardViewRoute(context, nextView);
            } else {
              _setBoardView(context, nextView);
            }
          },
        ),
        ShellActionSpec(
          id: 'task-board-detail-switch',
          icon: LucideIcons.chevronsUpDown,
          tooltip: l10n.tasksChooseBoard,
          enabled: state.workspaceId != null,
          onPressed: () => unawaited(_switchTaskBoard(context)),
        ),
        ShellActionSpec(
          id: 'task-board-detail-search',
          icon: _searchVisible ? AppIcons.close : AppIcons.search,
          highlighted: _searchVisible || state.searchQuery.trim().isNotEmpty,
          tooltip: l10n.taskBoardDetailSearchTitle,
          enabled: board != null,
          searchController: _searchVisible ? _searchController : null,
          searchHint: l10n.taskBoardDetailSearchPlaceholder,
          onSearchChanged: cubit.setSearchQuery,
          onCloseSearch: _closeSearch,
          onPressed: _toggleBoardSearch,
        ),
        ShellActionSpec(
          id: 'task-board-detail-filter',
          icon: LucideIcons.listFilter,
          tooltip: state.filters.hasAdvancedFilters
              ? l10n.taskBoardDetailFiltersActive
              : l10n.taskBoardDetailFilters,
          highlighted: state.filters.hasAdvancedFilters,
          enabled: board != null,
          onPressed: () =>
              unawaited(_openAdvancedFilterSheet(context, cubit.state)),
        ),
        ShellActionSpec(
          id: 'task-board-detail-actions',
          icon: LucideIcons.ellipsis,
          tooltip: l10n.taskBoardDetailBoardActions,
          enabled: board != null,
          onPressed: () => unawaited(_showBoardActionsSheet(context)),
        ),
        ShellActionSpec(
          id: 'task-board-detail-bulk-select',
          icon: LucideIcons.listChecks,
          tooltip: state.isBulkSelectMode
              ? l10n.taskBoardDetailExitBulkSelect
              : l10n.taskBoardDetailEnterBulkSelect,
          highlighted: state.isBulkSelectMode,
          enabled: board != null,
          onPressed: state.isBulkSelectMode
              ? cubit.exitBulkSelectMode
              : cubit.enterBulkSelectMode,
        ),
        if (state.isBulkSelectMode) ...[
          ShellActionSpec(
            id: 'task-board-detail-bulk-actions',
            icon: LucideIcons.slidersHorizontal,
            tooltip: l10n.taskBoardDetailBulkActions,
            enabled: state.selectedTaskIds.isNotEmpty,
            onPressed: () => unawaited(_openBulkActionsSheet(context)),
          ),
          ShellActionSpec(
            id: 'task-board-detail-bulk-move',
            icon: LucideIcons.arrowRightLeft,
            tooltip: l10n.taskBoardDetailMoveTask,
            onPressed: () => unawaited(_openBulkMovePicker(context, lists)),
          ),
          ShellActionSpec(
            id: 'task-board-detail-bulk-select-all',
            icon: LucideIcons.listChecks,
            tooltip: l10n.taskBoardDetailSelectAllFiltered,
            onPressed: cubit.selectAllFilteredTasks,
          ),
        ],
      ],
    );
  }

  Future<void> _switchTaskBoard(BuildContext context) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final wsId = cubit.state.workspaceId;
    final boardId = widget.boardId;
    final auth = context.read<AuthCubit?>();
    final actor = auth?.state.user?.id;
    if (wsId == null) return;
    final selected = await pickTaskBoard(
      context,
      repository: context.read<TaskRepository>(),
      workspaceId: wsId,
      selectedId: boardId,
    );
    if (!context.mounted ||
        !mounted ||
        selected == null ||
        selected.id == boardId ||
        widget.boardId != boardId ||
        auth?.state.user?.id != actor ||
        context.read<WorkspaceCubit>().state.currentWorkspace?.id != wsId) {
      return;
    }
    final view = switch (cubit.state.currentView) {
      TaskBoardDetailView.list => taskBoardDetailViewList,
      TaskBoardDetailView.kanban => taskBoardDetailViewKanban,
      TaskBoardDetailView.timeline => taskBoardDetailViewTimeline,
    };
    context.go(taskBoardViewLocation(boardId: selected.id, view: view));
  }

  Future<void> _dropKanbanTask(
    BuildContext context,
    TaskBoardTask task,
    String listId,
    String? beforeTaskId,
  ) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (cubit.state.isMutating) return;
    unawaited(AppHaptics.drop());
    try {
      await cubit.moveTask(
        taskId: task.id,
        listId: listId,
        beforeTaskId: beforeTaskId,
        positionCard: true,
      );
    } on Exception {
      if (!context.mounted) return;
      unawaited(AppHaptics.warning());
      showAppToast(
        context,
        message: context.l10n.commonSomethingWentWrong,
        variant: AppAlertVariant.destructive,
      );
    }
  }
}
