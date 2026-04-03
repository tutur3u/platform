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

  Future<void> _showListLayoutActionsMenu(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final action = await shad.showDialog<_TaskBoardLayoutListAction>(
      context: context,
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
      case _TaskBoardLayoutListAction.move:
        await _openMoveListStatusDialog(context, list);
      case _TaskBoardLayoutListAction.delete:
        await _confirmDeleteList(context, list);
    }
  }

  Future<void> _confirmDeleteList(
    BuildContext context,
    TaskBoardList list,
  ) async {
    final confirmed = await shad.showDialog<bool>(
      context: context,
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
    final currentStatus = TaskBoardList.normalizeSupportedStatus(list.status);
    if (currentStatus == null) return;
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

    final selectedStatus = await shad.showDialog<String>(
      context: context,
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

    final currentStatus = TaskBoardList.normalizeSupportedStatus(list.status);
    if (currentStatus == null || currentStatus == 'closed') return;

    final statusLists = _sortedLists(
      board.lists
          .where(
            (item) =>
                TaskBoardList.normalizeSupportedStatus(item.status) ==
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
      final currentPosition = item.position ?? i;
      if (currentPosition != i) {
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
                TaskBoardList.normalizeSupportedStatus(item.status) == status,
          )
          .toList(growable: false),
    );
    return statusLists.length;
  }
}
