part of 'task_board_detail_page.dart';

enum _BoardAction { manageLayout, renameBoard, recycleBin, refresh }

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
      case _BoardAction.manageLayout:
        unawaited(_openBoardLayoutSheet(context));
        return;
      case _BoardAction.renameBoard:
        unawaited(_openRenameBoardDialog(context));
        return;
      case _BoardAction.refresh:
        unawaited(context.read<TaskBoardDetailCubit>().reload());
        return;
      case _BoardAction.recycleBin:
        unawaited(_openRecycleBinSheet(context));
        return;
    }
  }

  Future<void> _openRecycleBinSheet(BuildContext context) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final board = cubit.state.board;
    if (board == null) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    Future<void> showError(String message) async {
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(message)),
      );
    }

    Future<void> showSuccess(String message) async {
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(content: Text(message)),
      );
    }

    // Build list name lookup map
    final listMap = <String, String>{};
    for (final list in board.lists) {
      if (list.name?.isNotEmpty == true) {
        listMap[list.id] = list.name!;
      }
    }

    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) {
        var isLoading = true;
        var isMutating = false;
        var errorMessage = '';
        var deletedTasks = const <TaskBoardTask>[];
        var selectedTaskIds = const <String>{};
        var initialized = false;

        return StatefulBuilder(
          builder: (context, setState) {
            Future<void> loadDeletedTasks({bool forceRefresh = false}) async {
              if (isMutating) return;
              setState(() {
                isLoading = true;
                errorMessage = '';
              });
              try {
                final tasks = await cubit.loadDeletedTasks(
                  limit: 200,
                  forceRefresh: forceRefresh,
                );
                if (!context.mounted) return;
                setState(() {
                  deletedTasks = tasks;
                  isLoading = false;
                });
              } on ApiException catch (error) {
                if (!context.mounted) return;
                setState(() {
                  isLoading = false;
                  errorMessage = error.message.trim().isEmpty
                      ? fallbackErrorMessage
                      : error.message;
                });
              } on Exception {
                if (!context.mounted) return;
                setState(() {
                  isLoading = false;
                  errorMessage = fallbackErrorMessage;
                });
              }
            }

            Future<void> restoreSelectedTasks() async {
              if (isMutating || selectedTaskIds.isEmpty) return;
              final taskIdsToRestore = selectedTaskIds.toList(growable: false);
              setState(() => isMutating = true);
              try {
                for (final taskId in taskIdsToRestore) {
                  await cubit.restoreTask(taskId: taskId);
                  if (!context.mounted) return;
                  setState(() {
                    deletedTasks = deletedTasks
                        .where((task) => task.id != taskId)
                        .toList(growable: false);
                    selectedTaskIds = selectedTaskIds
                        .where((id) => id != taskId)
                        .toSet();
                  });
                }
                await cubit.reload();
                if (!context.mounted) return;
                setState(() {
                  selectedTaskIds = {};
                  isMutating = false;
                });
                await showSuccess(context.l10n.taskBoardDetailTaskRestored);
              } on ApiException catch (error) {
                if (!context.mounted) return;
                await loadDeletedTasks(forceRefresh: true);
                if (!context.mounted) return;
                setState(() => isMutating = false);
                await showError(
                  error.message.trim().isEmpty
                      ? fallbackErrorMessage
                      : error.message,
                );
              } on Exception {
                if (!context.mounted) return;
                await loadDeletedTasks(forceRefresh: true);
                if (!context.mounted) return;
                setState(() => isMutating = false);
                await showError(fallbackErrorMessage);
              }
            }

            Future<void> deleteSelectedTasksForever() async {
              if (isMutating || selectedTaskIds.isEmpty) return;

              final confirmed =
                  await shad.showDialog<bool>(
                    context: context,
                    builder: (_) => AsyncDeleteConfirmationDialog(
                      title: context.l10n.taskBoardDetailDeleteTaskForever,
                      message: context
                          .l10n
                          .taskBoardDetailDeleteTaskForeverDescription,
                      cancelLabel: context.l10n.commonCancel,
                      confirmLabel: context.l10n.taskBoardDetailDeleteForever,
                      toastContext: toastContext,
                      onConfirm: () async {
                        for (final taskId in selectedTaskIds) {
                          await cubit.permanentlyDeleteTask(taskId: taskId);
                        }
                      },
                    ),
                  ) ??
                  false;

              if (!confirmed || !context.mounted) return;

              setState(() {
                isMutating = false;
                deletedTasks = deletedTasks
                    .where((item) => !selectedTaskIds.contains(item.id))
                    .toList(growable: false);
                selectedTaskIds = {};
              });
              await showSuccess(context.l10n.taskBoardDetailTaskDeletedForever);
            }

            void toggleSelectAll({bool? value}) {
              if (value == true) {
                setState(() {
                  selectedTaskIds = deletedTasks.map((t) => t.id).toSet();
                });
              } else {
                setState(() => selectedTaskIds = {});
              }
            }

            void toggleTaskSelection(String taskId, {required bool selected}) {
              setState(() {
                if (selected) {
                  selectedTaskIds = {...selectedTaskIds, taskId};
                } else {
                  selectedTaskIds = selectedTaskIds
                      .where((id) => id != taskId)
                      .toSet();
                }
              });
            }

            if (!initialized) {
              initialized = true;
              unawaited(loadDeletedTasks());
            }

            final allSelected =
                deletedTasks.isNotEmpty &&
                selectedTaskIds.length == deletedTasks.length;
            final someSelected = selectedTaskIds.isNotEmpty;

            return SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header row with title, refresh, close
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              const Icon(
                                Icons.delete_outline,
                                size: 20,
                              ),
                              const shad.Gap(8),
                              Text(
                                context.l10n.taskBoardDetailRecycleBin,
                                style: shad.Theme.of(context).typography.large
                                    .copyWith(
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        Tooltip(
                          message: context.l10n.taskBoardDetailRefresh,
                          child: shad.IconButton.ghost(
                            icon: const Icon(Icons.refresh_rounded, size: 18),
                            onPressed: isMutating
                                ? null
                                : () => unawaited(
                                    loadDeletedTasks(forceRefresh: true),
                                  ),
                          ),
                        ),
                        shad.IconButton.ghost(
                          icon: const Icon(Icons.close),
                          onPressed: isMutating
                              ? null
                              : () => unawaited(
                                  dismissAdaptiveDrawerOverlay(drawerContext),
                                ),
                        ),
                      ],
                    ),
                    const shad.Gap(8),
                    // Description
                    Text(
                      context.l10n.taskBoardDetailRecycleBinDescription,
                      style: shad.Theme.of(context).typography.small.copyWith(
                        color: shad.Theme.of(
                          context,
                        ).colorScheme.mutedForeground,
                      ),
                    ),
                    const shad.Gap(16),
                    // Content area
                    if (isLoading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Center(child: NovaLoadingIndicator()),
                      )
                    else if (errorMessage.trim().isNotEmpty)
                      shad.Card(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(errorMessage),
                            const shad.Gap(10),
                            shad.OutlineButton(
                              onPressed: isMutating
                                  ? null
                                  : () => unawaited(
                                      loadDeletedTasks(forceRefresh: true),
                                    ),
                              child: Text(context.l10n.commonRetry),
                            ),
                          ],
                        ),
                      )
                    else if (deletedTasks.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 32),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.delete_outline,
                                size: 48,
                                color: shad.Theme.of(context)
                                    .colorScheme
                                    .mutedForeground
                                    .withValues(alpha: 0.5),
                              ),
                              const shad.Gap(12),
                              Text(
                                context.l10n.taskBoardDetailRecycleBinEmpty,
                                style: shad.Theme.of(context).typography.small
                                    .copyWith(
                                      color: shad.Theme.of(
                                        context,
                                      ).colorScheme.mutedForeground,
                                    ),
                              ),
                              const shad.Gap(4),
                              Text(
                                context.l10n.taskBoardDetailRecycleBinEmptyHint,
                                style: shad.Theme.of(context).typography.small
                                    .copyWith(
                                      color: shad.Theme.of(context)
                                          .colorScheme
                                          .mutedForeground
                                          .withValues(alpha: 0.7),
                                      fontSize: 11,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      Flexible(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Select all header
                            Padding(
                              padding: const EdgeInsets.only(
                                bottom: 8,
                                left: 4,
                              ),
                              child: Row(
                                children: [
                                  shad.Checkbox(
                                    state: allSelected
                                        ? shad.CheckboxState.checked
                                        : selectedTaskIds.isNotEmpty
                                        ? shad.CheckboxState.indeterminate
                                        : shad.CheckboxState.unchecked,
                                    onChanged: (v) => toggleSelectAll(
                                      value: v == shad.CheckboxState.checked,
                                    ),
                                  ),
                                  const shad.Gap(12),
                                  Text(
                                    someSelected
                                        ? context.l10n
                                              .taskBoardDetailSelectedCount(
                                                selectedTaskIds.length,
                                                deletedTasks.length,
                                              )
                                        : context.l10n
                                              .taskBoardDetailDeletedTasksCount(
                                                deletedTasks.length,
                                              ),
                                    style: shad.Theme.of(context)
                                        .typography
                                        .small
                                        .copyWith(
                                          fontWeight: FontWeight.w500,
                                        ),
                                  ),
                                ],
                              ),
                            ),
                            // Task list
                            Flexible(
                              child: ListView.separated(
                                shrinkWrap: true,
                                itemCount: deletedTasks.length,
                                separatorBuilder: (_, _) =>
                                    const shad.Divider(),
                                itemBuilder: (context, index) {
                                  final task = deletedTasks[index];
                                  final isSelected = selectedTaskIds.contains(
                                    task.id,
                                  );

                                  return _RecycleBinTaskRow(
                                    task: task,
                                    listName: listMap[task.listId],
                                    isSelected: isSelected,
                                    onSelected: (selected) =>
                                        toggleTaskSelection(
                                          task.id,
                                          selected: selected,
                                        ),
                                    disabled: isMutating,
                                  );
                                },
                              ),
                            ),
                            // Bulk action bar
                            if (someSelected)
                              Padding(
                                padding: const EdgeInsets.only(top: 12),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: shad.OutlineButton(
                                        onPressed: isMutating
                                            ? null
                                            : () => unawaited(
                                                restoreSelectedTasks(),
                                              ),
                                        leading: const Icon(
                                          Icons.restore_rounded,
                                          size: 16,
                                        ),
                                        child: Text(
                                          context.l10n
                                              .taskBoardDetailRestoreTasks(
                                                selectedTaskIds.length,
                                              ),
                                        ),
                                      ),
                                    ),
                                    const shad.Gap(8),
                                    Expanded(
                                      child: shad.DestructiveButton(
                                        onPressed: isMutating
                                            ? null
                                            : () => unawaited(
                                                deleteSelectedTasksForever(),
                                              ),
                                        leading: const Icon(
                                          Icons.delete_forever_rounded,
                                          size: 16,
                                        ),
                                        child: Text(
                                          context.l10n
                                              .taskBoardDetailDeleteTasks(
                                                selectedTaskIds.length,
                                              ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
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
        currentListId: list.id,
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
                excludingListId: list.id,
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
              await context.read<TaskBoardDetailCubit>().updateList(
                listId: list.id,
                name: name,
                status: status,
                color: color,
              );
              return true;
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

typedef _RecycleBinTaskRow = RecycleBinTaskRow;
