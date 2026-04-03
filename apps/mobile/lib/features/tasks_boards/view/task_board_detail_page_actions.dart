part of 'task_board_detail_page.dart';

enum _BoardAction { manageLayout, renameBoard, refresh }

extension on _TaskBoardDetailPageViewState {
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
                  leading: const Icon(Icons.refresh_rounded),
                  title: Text(context.l10n.taskBoardDetailRefresh),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _handleBoardAction(context, _BoardAction.refresh);
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
      case _BoardAction.manageLayout:
        unawaited(_openBoardLayoutSheet(context));
        return;
      case _BoardAction.renameBoard:
        unawaited(_openRenameBoardDialog(context));
        return;
      case _BoardAction.refresh:
        unawaited(context.read<TaskBoardDetailCubit>().reload());
        return;
    }
  }

  Future<void> _openRenameBoardDialog(BuildContext context) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    final initialName = board.name?.trim() ?? '';
    final value = await shad.showDialog<String>(
      context: context,
      builder: (_) => _TaskBoardTextInputDialog(
        title: context.l10n.taskBoardDetailRenameBoard,
        hintText: context.l10n.taskBoardDetailUntitledBoard,
        confirmLabel: context.l10n.timerSave,
        initialValue: initialName,
      ),
    );
    if (value == null || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().renameBoard(
        name: value,
        icon: board.icon,
      ),
      successMessage: context.l10n.taskBoardDetailBoardRenamed,
    );
  }

  Future<void> _openCreateListDialog(BuildContext context) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardListFormSheet(
        title: context.l10n.taskBoardDetailCreateList,
        confirmLabel: context.l10n.taskBoardDetailCreateList,
        successMessage: context.l10n.taskBoardDetailListCreated,
        existingLists: board.lists,
        onSubmit:
            ({
              required name,
              required status,
              required color,
            }) async {
              if (!_taskBoardCanCreateListInStatus(board.lists, status)) {
                final toastContext = Navigator.of(
                  context,
                  rootNavigator: true,
                ).context;
                if (!toastContext.mounted) return;
                shad.showToast(
                  context: toastContext,
                  builder: (context, overlay) => shad.Alert.destructive(
                    content: Text(
                      context.l10n.taskBoardDetailCannotCreateMoreClosedLists,
                    ),
                  ),
                );
                return;
              }
              await context.read<TaskBoardDetailCubit>().createList(
                name: name,
                status: status,
                color: color,
              );
            },
      ),
    );
  }

  Future<void> _openEditListDialog(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardListFormSheet(
        title: context.l10n.taskBoardDetailEditList,
        confirmLabel: context.l10n.timerSave,
        successMessage: context.l10n.taskBoardDetailListUpdated,
        initialName: list.name?.trim() ?? '',
        initialStatus:
            TaskBoardList.normalizeSupportedStatus(list.status) ?? 'active',
        initialColor:
            TaskBoardList.normalizeSupportedColor(list.color) ?? 'GRAY',
        existingLists: board.lists,
        onSubmit:
            ({
              required name,
              required status,
              required color,
            }) async {
              if (!_taskBoardCanCreateListInStatus(board.lists, status)) {
                final toastContext = Navigator.of(
                  context,
                  rootNavigator: true,
                ).context;
                if (!toastContext.mounted) return;
                shad.showToast(
                  context: toastContext,
                  builder: (context, overlay) => shad.Alert.destructive(
                    content: Text(
                      context.l10n.taskBoardDetailCannotCreateMoreClosedLists,
                    ),
                  ),
                );
                return;
              }
              await context.read<TaskBoardDetailCubit>().updateList(
                listId: list.id,
                name: name,
                status: status,
                color: color,
              );
            },
      ),
    );
  }

  Future<void> _openAdvancedFilterSheet(
    BuildContext context,
    TaskBoardDetailState state,
  ) async {
    final board = state.board;
    if (board == null) return;

    final content = _TaskBoardAdvancedFilterSheet(
      initialFilters: state.filters,
      lists: _sortedLists(board.lists),
      members: board.members,
      labels: board.labels,
      projects: board.projects,
      onApply: (filters) {
        context.read<TaskBoardDetailCubit>().setFilters(filters);
      },
    );

    await showAdaptiveDrawer(context: context, builder: (_) => content);
  }

  Future<void> _runBoardAction(
    BuildContext context,
    Future<void> Function() action, {
    required String successMessage,
  }) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    try {
      await action();
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(successMessage)),
      );
    } on ApiException catch (error) {
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
    } on Exception {
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    }
  }
}
