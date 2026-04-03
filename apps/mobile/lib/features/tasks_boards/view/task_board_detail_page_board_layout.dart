part of 'task_board_detail_page.dart';

enum _TaskBoardLayoutListAction { edit, move, delete }

extension on _TaskBoardDetailPageViewState {
  Future<void> _openBoardLayoutSheet(BuildContext context) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) {
        return BlocProvider.value(
          value: cubit,
          child: SafeArea(
            top: false,
            child: BlocConsumer<TaskBoardDetailCubit, TaskBoardDetailState>(
              listenWhen: (previous, current) =>
                  previous.isMutating != current.isMutating ||
                  previous.mutationError != current.mutationError,
              listener: (context, state) {
                if (state.mutationError != null && !state.isMutating) {
                  final toastContext = Navigator.of(
                    context,
                    rootNavigator: true,
                  ).context;
                  if (!toastContext.mounted) return;
                  shad.showToast(
                    context: toastContext,
                    builder: (context, overlay) => shad.Alert.destructive(
                      content: Text(state.mutationError!),
                    ),
                  );
                }
              },
              buildWhen: (previous, current) =>
                  previous.board != current.board ||
                  previous.isMutating != current.isMutating,
              builder: (context, state) {
                final board = state.board;
                if (board == null) {
                  return const SizedBox.shrink();
                }

                return Stack(
                  children: [
                    _TaskBoardBoardLayoutSheet(
                      board: board,
                      isMutating: state.isMutating,
                      onClose: () =>
                          dismissAdaptiveDrawerOverlay(drawerContext),
                      onCreateListForStatus: (status) =>
                          _openCreateListDialogForStatus(context, status),
                      onMoveListUp: (list) => _moveListWithinStatus(
                        context,
                        list: list,
                        delta: -1,
                      ),
                      onMoveListDown: (list) => _moveListWithinStatus(
                        context,
                        list: list,
                        delta: 1,
                      ),
                      onListActions: (list) => _showListLayoutActionsMenu(
                        context,
                        list,
                      ),
                    ),
                    if (state.isMutating)
                      Positioned.fill(
                        child: ColoredBox(
                          color: Colors.black.withValues(alpha: 0.3),
                          child: const Center(
                            child: NovaLoadingIndicator(),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }

  Future<void> _openCreateListDialogForStatus(
    BuildContext context,
    String status,
  ) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    final normalizedStatus =
        TaskBoardList.normalizeSupportedStatus(status) ?? 'active';
    if (!_taskBoardCanCreateListInStatus(board.lists, normalizedStatus)) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
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

    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardListFormSheet(
        title: context.l10n.taskBoardDetailCreateList,
        confirmLabel: context.l10n.taskBoardDetailCreateList,
        successMessage: context.l10n.taskBoardDetailListCreated,
        initialStatus: normalizedStatus,
        existingLists: board.lists,
        onSubmit:
            ({
              required name,
              required status,
              required color,
            }) async {
              final currentBoard = context
                  .read<TaskBoardDetailCubit>()
                  .state
                  .board;
              if (currentBoard == null) return false;
              if (!_taskBoardCanCreateListInStatus(
                currentBoard.lists,
                status,
              )) {
                final toastContext = Navigator.of(
                  context,
                  rootNavigator: true,
                ).context;
                if (!toastContext.mounted) return false;
                shad.showToast(
                  context: toastContext,
                  builder: (context, overlay) => shad.Alert.destructive(
                    content: Text(
                      context.l10n.taskBoardDetailCannotCreateMoreClosedLists,
                    ),
                  ),
                );
                return false;
              }
              await context.read<TaskBoardDetailCubit>().createList(
                name: name,
                status: status,
                color: color,
              );
              return true;
            },
      ),
    );
  }

  Future<void> _showListLayoutActionsMenu(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final action = await showAdaptiveSheet<_TaskBoardLayoutListAction>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (dialogContext) => _TaskBoardListActionsDialog(
        onEdit: () => Navigator.of(dialogContext).pop(
          _TaskBoardLayoutListAction.edit,
        ),
        onMove: () => Navigator.of(dialogContext).pop(
          _TaskBoardLayoutListAction.move,
        ),
        onDelete: () => Navigator.of(dialogContext).pop(
          _TaskBoardLayoutListAction.delete,
        ),
        onCancel: () => Navigator.of(dialogContext).pop(),
      ),
    );

    if (action == null || !context.mounted) return;

    switch (action) {
      case _TaskBoardLayoutListAction.edit:
        await _openEditListDialog(context, list);
        return;
      case _TaskBoardLayoutListAction.move:
        await _openMoveListStatusDialog(context, list);
        return;
      case _TaskBoardLayoutListAction.delete:
        await _confirmDeleteList(context, list);
        return;
    }
  }

  Future<void> _confirmDeleteList(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final confirmed = await showAdaptiveSheet<bool>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardDeleteListDialog(
        title: context.l10n.taskBoardDetailDeleteListTitle,
        description: context.l10n.taskBoardDetailDeleteListDescription,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.taskBoardDetailDeleteList,
      ),
    );
    if (confirmed != true || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().updateList(
        listId: list.id,
        deleted: true,
      ),
      successMessage: context.l10n.taskBoardDetailListDeleted,
    );
  }

  Future<void> _openMoveListStatusDialog(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final currentStatus =
        TaskBoardList.normalizeSupportedStatus(list.status) ?? 'active';
    if (currentStatus == 'closed') {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardDetailCannotMoveToClosedStatus),
        ),
      );
      return;
    }

    final selectedStatus = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardMoveListStatusDialog(
        currentStatus: currentStatus,
      ),
    );
    if (selectedStatus == null || !context.mounted) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().updateList(
        listId: list.id,
        status: selectedStatus,
        position: _nextPositionForStatus(context, selectedStatus),
      ),
      successMessage: context.l10n.taskBoardDetailMovedToStatus(
        _taskBoardListStatusLabel(context, selectedStatus),
      ),
    );
  }

  Future<void> _moveListWithinStatus(
    BuildContext context, {
    required TaskBoardList list,
    required int delta,
  }) async {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;

    final currentStatus =
        TaskBoardList.normalizeSupportedStatus(list.status) ?? 'active';
    if (currentStatus == 'closed') return;

    final statusLists = _sortedLists(
      board.lists
          .where(
            (item) =>
                (TaskBoardList.normalizeSupportedStatus(item.status) ??
                    'active') ==
                currentStatus,
          )
          .toList(growable: false),
    );
    final currentIndex = statusLists.indexWhere((item) => item.id == list.id);
    if (currentIndex == -1) return;

    final newIndex = currentIndex + delta;
    if (newIndex < 0 || newIndex >= statusLists.length) return;

    final reordered = [...statusLists];
    final moving = reordered.removeAt(currentIndex);
    reordered.insert(newIndex, moving);

    final updates = <String, int>{};
    for (var i = 0; i < reordered.length; i++) {
      final item = reordered[i];
      if (item.position != i) {
        updates[item.id] = i;
      }
    }
    if (updates.isEmpty) return;

    await _runBoardAction(
      context,
      () => context.read<TaskBoardDetailCubit>().reorderListsPositions(
        updates: updates,
      ),
      successMessage: context.l10n.taskBoardDetailListsReordered,
    );
  }

  int _nextPositionForStatus(BuildContext context, String status) {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return 0;

    final statusLists = _sortedLists(
      board.lists
          .where(
            (item) =>
                (TaskBoardList.normalizeSupportedStatus(item.status) ??
                    'active') ==
                status,
          )
          .toList(growable: false),
    );
    final maxPosition = statusLists.fold<int>(
      -1,
      (currentMax, item) => item.position != null && item.position! > currentMax
          ? item.position!
          : currentMax,
    );
    return maxPosition + 1;
  }
}
