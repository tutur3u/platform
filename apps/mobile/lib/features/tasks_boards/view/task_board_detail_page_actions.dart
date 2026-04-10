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
            Future<void> loadDeletedTasks({
              bool forceRefresh = false,
              bool allowDuringMutation = false,
            }) async {
              if (isMutating && !allowDuringMutation) return;
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
                final visibleIds = tasks.map((task) => task.id).toSet();
                setState(() {
                  deletedTasks = tasks;
                  selectedTaskIds = selectedTaskIds
                      .where(visibleIds.contains)
                      .toSet();
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
                  await cubit.restoreTask(
                    taskId: taskId,
                    reloadBoard: false,
                  );
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
                setState(() => isMutating = false);
                await loadDeletedTasks(
                  forceRefresh: true,
                  allowDuringMutation: true,
                );
                if (!context.mounted) return;
                await showError(
                  error.message.trim().isEmpty
                      ? fallbackErrorMessage
                      : error.message,
                );
              } on Exception {
                if (!context.mounted) return;
                setState(() => isMutating = false);
                await loadDeletedTasks(
                  forceRefresh: true,
                  allowDuringMutation: true,
                );
                if (!context.mounted) return;
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
                          await cubit.permanentlyDeleteTask(
                            taskId: taskId,
                            reloadBoard: false,
                          );
                        }
                      },
                    ),
                  ) ??
                  false;

              if (!confirmed || !context.mounted) return;

              await cubit.reload();
              if (!context.mounted) return;
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
    await showAdaptiveSheet<void>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _TaskBoardRenameBoardSheet(
        title: context.l10n.taskBoardDetailRenameBoard,
        hintText: context.l10n.taskBoardDetailUntitledBoard,
        confirmLabel: context.l10n.timerSave,
        successMessage: context.l10n.taskBoardDetailBoardRenamed,
        initialValue: initialName,
        onSubmit: ({required name}) async {
          final currentBoard = context.read<TaskBoardDetailCubit>().state.board;
          if (currentBoard == null) return false;
          await context.read<TaskBoardDetailCubit>().renameBoard(
            name: name,
            icon: currentBoard.icon,
          );
          return true;
        },
      ),
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

class _TaskBoardBulkActionsDrawer extends StatefulWidget {
  const _TaskBoardBulkActionsDrawer({required this.onClose});

  final VoidCallback onClose;

  @override
  State<_TaskBoardBulkActionsDrawer> createState() =>
      _TaskBoardBulkActionsDrawerState();
}

class _TaskBoardBulkActionsDrawerState
    extends State<_TaskBoardBulkActionsDrawer> {
  bool _isRunningAction = false;

  TaskBoardDetailCubit get _cubit => context.read<TaskBoardDetailCubit>();

  Future<void> _runBulkAction(
    Future<TaskBulkResult> Function() action,
  ) async {
    if (_isRunningAction) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final l10n = context.l10n;
    setState(() => _isRunningAction = true);

    try {
      final result = await action();
      if (!mounted || !toastContext.mounted) return;

      final message = result.hasFailures
          ? l10n.taskBoardDetailBulkPartialSuccess(
              result.successCount,
              result.failCount,
            )
          : l10n.taskBoardDetailBulkAllSuccess(result.successCount);
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => result.hasFailures
            ? shad.Alert.destructive(content: Text(message))
            : shad.Alert(content: Text(message)),
      );
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty
                ? l10n.commonSomethingWentWrong
                : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(l10n.commonSomethingWentWrong),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isRunningAction = false);
      }
    }
  }

  int _firstDayOfWeek(BuildContext context) {
    const weekdayByIndex = <int>[
      DateTime.sunday,
      DateTime.monday,
      DateTime.tuesday,
      DateTime.wednesday,
      DateTime.thursday,
      DateTime.friday,
      DateTime.saturday,
    ];
    final firstDayOfWeekIndex = MaterialLocalizations.of(
      context,
    ).firstDayOfWeekIndex;
    return weekdayByIndex[firstDayOfWeekIndex % 7];
  }

  bool _isPersonalWorkspaceForBoard(TaskBoardDetail board) {
    final workspaceState = context.read<WorkspaceCubit>().state;
    for (final workspace in workspaceState.workspaces) {
      if (workspace.id == board.wsId) {
        return workspace.personal;
      }
    }
    final currentWorkspace = workspaceState.currentWorkspace;
    if (currentWorkspace?.id == board.wsId) {
      return currentWorkspace?.personal ?? false;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
      builder: (context, state) {
        final board = state.board;
        final selectedTaskIds = state.selectedTaskIds;
        final selectedCount = selectedTaskIds.length;
        final canRun =
            selectedCount > 0 && !_isRunningAction && !state.isMutating;

        if (board == null) {
          return const SizedBox.shrink();
        }

        final selectedTasks = board.tasks
            .where((task) => selectedTaskIds.contains(task.id))
            .toList(growable: false);
        final appliedLabelIds = _collectAppliedIds(
          selectedTasks.map((task) => task.labelIds),
          selectedCount,
        );
        final appliedProjectIds = _collectAppliedIds(
          selectedTasks.map((task) => task.projectIds),
          selectedCount,
        );
        final appliedAssigneeIds = _collectAppliedIds(
          selectedTasks.map((task) => task.assigneeIds),
          selectedCount,
        );

        final hasDoneList = board.lists.any(
          (list) =>
              TaskBoardList.normalizeSupportedStatus(list.status) == 'done',
        );
        final hasClosedList = board.lists.any(
          (list) =>
              TaskBoardList.normalizeSupportedStatus(list.status) == 'closed',
        );

        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.taskBoardDetailBulkActions,
                        style: shad.Theme.of(context).typography.large.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    shad.IconButton.ghost(
                      icon: const Icon(Icons.close),
                      onPressed: widget.onClose,
                    ),
                  ],
                ),
                const shad.Gap(8),
                Text(
                  selectedCount > 0
                      ? l10n.taskBoardDetailSelectedCount(
                          selectedCount,
                          state.filteredTasks.length,
                        )
                      : l10n.taskBoardDetailNoTasksSelected,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    color: shad.Theme.of(context).colorScheme.mutedForeground,
                  ),
                ),
                const shad.Gap(12),
                Expanded(
                  child: ListView(
                    children: [
                      if (hasDoneList)
                        ListTile(
                          enabled: canRun,
                          leading: const Icon(Icons.check_circle_outline),
                          title: Text(l10n.taskBoardDetailBulkMarkDone),
                          onTap: () => unawaited(
                            _runBulkAction(
                              () => _cubit.bulkMoveToStatus('done'),
                            ),
                          ),
                        ),
                      if (hasClosedList)
                        ListTile(
                          enabled: canRun,
                          leading: const Icon(Icons.block_outlined),
                          title: Text(l10n.taskBoardDetailBulkMarkClosed),
                          onTap: () => unawaited(
                            _runBulkAction(
                              () => _cubit.bulkMoveToStatus('closed'),
                            ),
                          ),
                        ),
                      if (hasDoneList || hasClosedList) const shad.Divider(),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.low_priority),
                        title: Text(l10n.taskBoardDetailPriority),
                        onTap: () => unawaited(
                          _openPriorityPicker(canRun: canRun),
                        ),
                      ),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.calendar_today_outlined),
                        title: Text(l10n.taskBoardDetailTaskEndDate),
                        onTap: () => unawaited(
                          _openDueDatePicker(canRun: canRun),
                        ),
                      ),
                      if (board.estimationType?.trim().isNotEmpty == true)
                        ListTile(
                          enabled: canRun,
                          leading: const Icon(Icons.timer_outlined),
                          title: Text(l10n.taskBoardDetailTaskEstimation),
                          onTap: () => unawaited(
                            _openEstimationPicker(board: board, canRun: canRun),
                          ),
                        ),
                      const shad.Divider(),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.label_outline),
                        title: Text(l10n.taskBoardDetailTaskLabels),
                        onTap: () => unawaited(
                          _openLabelPicker(
                            labels: board.labels,
                            appliedIds: appliedLabelIds,
                            canRun: canRun,
                          ),
                        ),
                      ),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.account_tree_outlined),
                        title: Text(l10n.taskBoardDetailTaskProjects),
                        onTap: () => unawaited(
                          _openProjectPicker(
                            projects: board.projects,
                            appliedIds: appliedProjectIds,
                            canRun: canRun,
                          ),
                        ),
                      ),
                      if (!_isPersonalWorkspaceForBoard(board))
                        ListTile(
                          enabled: canRun,
                          leading: const Icon(Icons.person_outline),
                          title: Text(l10n.taskBoardDetailTaskAssignees),
                          onTap: () => unawaited(
                            _openAssigneePicker(
                              members: board.members,
                              appliedIds: appliedAssigneeIds,
                              canRun: canRun,
                            ),
                          ),
                        ),
                      const shad.Divider(),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.move_down_outlined),
                        title: Text(l10n.taskBoardDetailMoveTask),
                        onTap: () =>
                            unawaited(_openMoveToListPicker(canRun: canRun)),
                      ),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.compare_arrows_outlined),
                        title: Text(l10n.taskBoardDetailBulkMoveToBoard),
                        onTap: () =>
                            unawaited(_openMoveToBoardPicker(canRun: canRun)),
                      ),
                      const shad.Divider(),
                      ListTile(
                        enabled: canRun,
                        leading: const Icon(Icons.delete_outline),
                        title: Text(
                          l10n.taskBoardDetailDeleteTasks(selectedCount),
                        ),
                        onTap: () => unawaited(
                          _runBulkAction(
                            () => _cubit.bulkDeleteSelectedTasks(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                Row(
                  children: [
                    Expanded(
                      child: shad.OutlineButton(
                        onPressed: selectedCount > 0
                            ? () => _cubit.selectAllFilteredTasks()
                            : null,
                        child: Text(l10n.taskBoardDetailSelectAllFiltered),
                      ),
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: () {
                          _cubit.exitBulkSelectMode();
                          widget.onClose();
                        },
                        child: Text(l10n.taskBoardDetailExitBulkSelect),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Set<String> _collectAppliedIds(
    Iterable<List<String>> values,
    int selectedCount,
  ) {
    if (selectedCount <= 0) return const <String>{};
    final counts = <String, int>{};
    for (final ids in values) {
      for (final id in ids) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts.entries
        .where((entry) => entry.value == selectedCount)
        .map((entry) => entry.key)
        .toSet();
  }

  Future<void> _openPriorityPicker({required bool canRun}) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final items = [
      _BulkChoiceItem(
        id: 'critical',
        label: l10n.taskBoardDetailPriorityCritical,
      ),
      _BulkChoiceItem(id: 'high', label: l10n.taskBoardDetailPriorityHigh),
      _BulkChoiceItem(
        id: 'normal',
        label: l10n.taskBoardDetailPriorityNormal,
      ),
      _BulkChoiceItem(id: 'low', label: l10n.taskBoardDetailPriorityLow),
      _BulkChoiceItem(id: 'none', label: l10n.taskBoardDetailPriorityNone),
    ];
    final choice = await _pickChoice(
      title: l10n.taskBoardDetailPriority,
      items: items,
    );
    if (choice == null || !mounted) return;

    await _runBulkAction(
      () => _cubit.bulkUpdatePriority(choice == 'none' ? null : choice),
    );
  }

  Future<void> _openDueDatePicker({required bool canRun}) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final choices = [
      _BulkChoiceItem(id: 'today', label: l10n.taskBoardDetailToday),
      _BulkChoiceItem(id: 'tomorrow', label: l10n.taskBoardDetailTomorrow),
      _BulkChoiceItem(id: 'this_week', label: l10n.taskBoardDetailThisWeek),
      _BulkChoiceItem(id: 'next_week', label: l10n.taskBoardDetailNextWeek),
      _BulkChoiceItem(id: 'custom', label: l10n.taskBoardDetailSetCustomDate),
      _BulkChoiceItem(id: 'clear', label: l10n.taskBoardDetailRemoveDueDate),
    ];
    final choice = await _pickChoice(
      title: l10n.taskBoardDetailTaskEndDate,
      items: choices,
    );
    if (choice == null || !mounted) return;

    if (choice == 'custom') {
      final picked = await showDatePicker(
        context: context,
        initialDate: DateTime.now(),
        firstDate: DateTime(2000),
        lastDate: DateTime(2100),
      );
      if (picked == null || !mounted) return;
      await _runBulkAction(() => _cubit.bulkUpdateCustomDueDate(picked));
      return;
    }

    await _runBulkAction(
      () => _cubit.bulkUpdateDueDatePreset(
        choice,
        weekStartsOn: _firstDayOfWeek(context),
      ),
    );
  }

  Future<void> _openEstimationPicker({
    required TaskBoardDetail board,
    required bool canRun,
  }) async {
    if (!canRun) return;
    final options = _taskEstimationOptions(board);
    final l10n = context.l10n;
    final items = [
      _BulkChoiceItem(
        id: 'none',
        label: l10n.taskBoardDetailTaskEstimationNone,
      ),
      ...options.map(
        (points) => _BulkChoiceItem(
          id: points.toString(),
          label: _taskEstimationPointLabel(points: points, board: board),
        ),
      ),
    ];

    final choice = await _pickChoice(
      title: l10n.taskBoardDetailTaskEstimation,
      items: items,
    );
    if (choice == null || !mounted) return;

    final value = choice == 'none' ? null : int.tryParse(choice);
    await _runBulkAction(() => _cubit.bulkUpdateEstimation(value));
  }

  Future<void> _openLabelPicker({
    required List<TaskLabel> labels,
    required Set<String> appliedIds,
    required bool canRun,
  }) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final choice = await _pickChoice(
      title: l10n.taskBoardDetailTaskLabels,
      items: [
        _BulkChoiceItem(
          id: '__clear__',
          label: l10n.taskBoardDetailBulkClearLabels,
        ),
        ...labels.map(
          (label) => _BulkChoiceItem(
            id: label.id,
            label: label.name,
            selected: appliedIds.contains(label.id),
          ),
        ),
      ],
      searchable: true,
    );

    if (choice == null || !mounted) return;
    if (choice == '__clear__') {
      await _runBulkAction(_cubit.bulkClearLabels);
      return;
    }

    if (appliedIds.contains(choice)) {
      await _runBulkAction(() => _cubit.bulkRemoveLabel(choice));
    } else {
      await _runBulkAction(() => _cubit.bulkAddLabel(choice));
    }
  }

  Future<void> _openProjectPicker({
    required List<TaskProjectSummary> projects,
    required Set<String> appliedIds,
    required bool canRun,
  }) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final choice = await _pickChoice(
      title: l10n.taskBoardDetailTaskProjects,
      items: [
        _BulkChoiceItem(
          id: '__clear__',
          label: l10n.taskBoardDetailBulkClearProjects,
        ),
        ...projects.map(
          (project) => _BulkChoiceItem(
            id: project.id,
            label: project.name,
            selected: appliedIds.contains(project.id),
          ),
        ),
      ],
      searchable: true,
    );

    if (choice == null || !mounted) return;
    if (choice == '__clear__') {
      await _runBulkAction(_cubit.bulkClearProjects);
      return;
    }

    if (appliedIds.contains(choice)) {
      await _runBulkAction(() => _cubit.bulkRemoveProject(choice));
    } else {
      await _runBulkAction(() => _cubit.bulkAddProject(choice));
    }
  }

  Future<void> _openAssigneePicker({
    required List<WorkspaceUserOption> members,
    required Set<String> appliedIds,
    required bool canRun,
  }) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final choice = await _pickChoice(
      title: l10n.taskBoardDetailTaskAssignees,
      items: [
        _BulkChoiceItem(
          id: '__clear__',
          label: l10n.taskBoardDetailBulkClearAssignees,
        ),
        ...members.map(
          (member) => _BulkChoiceItem(
            id: member.id,
            label: member.label,
            selected: appliedIds.contains(member.id),
          ),
        ),
      ],
      searchable: true,
    );

    if (choice == null || !mounted) return;
    if (choice == '__clear__') {
      await _runBulkAction(_cubit.bulkClearAssignees);
      return;
    }

    if (appliedIds.contains(choice)) {
      await _runBulkAction(() => _cubit.bulkRemoveAssignee(choice));
    } else {
      await _runBulkAction(() => _cubit.bulkAddAssignee(choice));
    }
  }

  Future<void> _openMoveToListPicker({required bool canRun}) async {
    if (!canRun) return;
    final board = _cubit.state.board;
    if (board == null) return;

    final listId = await _pickChoice(
      title: context.l10n.taskBoardDetailMoveTask,
      items: board.lists
          .map(
            (list) => _BulkChoiceItem(
              id: list.id,
              label: list.name?.trim().isNotEmpty == true
                  ? list.name!.trim()
                  : context.l10n.taskBoardDetailUntitledList,
            ),
          )
          .toList(growable: false),
      searchable: true,
    );
    if (listId == null || !mounted) return;

    await _runBulkAction(() => _cubit.bulkMoveToList(listId: listId));
  }

  Future<void> _openMoveToBoardPicker({required bool canRun}) async {
    if (!canRun) return;
    final l10n = context.l10n;
    final currentBoard = _cubit.state.board;
    if (currentBoard == null) return;

    final boards = await _cubit.getTaskBoards();
    if (!mounted) return;
    final candidateBoards = boards
        .where((board) => board.id != currentBoard.id)
        .toList(growable: false);
    if (candidateBoards.isEmpty) {
      return;
    }

    final targetBoardId = await _pickChoice(
      title: l10n.taskBoardDetailBulkMoveToBoard,
      items: candidateBoards
          .map(
            (board) => _BulkChoiceItem(
              id: board.id,
              label: board.name?.trim().isNotEmpty == true
                  ? board.name!.trim()
                  : l10n.taskBoardDetailUntitledBoard,
            ),
          )
          .toList(growable: false),
      searchable: true,
    );
    if (targetBoardId == null || !mounted) return;

    final targetLists = await _cubit.getBoardListsForBoard(targetBoardId);
    if (targetLists.isEmpty || !mounted) return;

    final targetListId = await _pickChoice(
      title: context.l10n.taskBoardDetailTaskListLabel,
      items: targetLists
          .map(
            (list) => _BulkChoiceItem(
              id: list.id,
              label: list.name?.trim().isNotEmpty == true
                  ? list.name!.trim()
                  : context.l10n.taskBoardDetailUntitledList,
            ),
          )
          .toList(growable: false),
      searchable: true,
    );
    if (targetListId == null || !mounted) return;

    await _runBulkAction(
      () => _cubit.bulkMoveToList(
        listId: targetListId,
        targetBoardId: targetBoardId,
      ),
    );
  }

  Future<String?> _pickChoice({
    required String title,
    required List<_BulkChoiceItem> items,
    bool searchable = false,
  }) {
    return shad.showDialog<String>(
      context: context,
      builder: (context) => _BulkChoicePickerDialog(
        title: title,
        items: items,
        searchable: searchable,
      ),
    );
  }
}

class _BulkChoiceItem extends Equatable {
  const _BulkChoiceItem({
    required this.id,
    required this.label,
    this.selected = false,
  });

  final String id;
  final String label;
  final bool selected;

  @override
  List<Object?> get props => [id, label, selected];
}

class _BulkChoicePickerDialog extends StatefulWidget {
  const _BulkChoicePickerDialog({
    required this.title,
    required this.items,
    required this.searchable,
  });

  final String title;
  final List<_BulkChoiceItem> items;
  final bool searchable;

  @override
  State<_BulkChoicePickerDialog> createState() =>
      _BulkChoicePickerDialogState();
}

class _BulkChoicePickerDialogState extends State<_BulkChoicePickerDialog> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final normalizedQuery = _query.trim().toLowerCase();
    final filtered = widget.items
        .where(
          (item) =>
              normalizedQuery.isEmpty ||
              item.label.toLowerCase().contains(normalizedQuery),
        )
        .toList(growable: false);

    return shad.AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.searchable)
              shad.TextField(
                hintText: context.l10n.taskBoardDetailSearchPlaceholder,
                onChanged: (value) => setState(() => _query = value),
              ),
            if (widget.searchable) const shad.Gap(10),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 360),
              child: filtered.isEmpty
                  ? Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        context.l10n.taskBoardDetailNoMatchingTasks,
                        style: shad.Theme.of(context).typography.textMuted,
                      ),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: filtered.length,
                      separatorBuilder: (_, _) => const shad.Divider(),
                      itemBuilder: (context, index) {
                        final item = filtered[index];
                        return shad.GhostButton(
                          onPressed: () => Navigator.of(context).pop(item.id),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  item.label,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (item.selected)
                                Icon(
                                  Icons.check,
                                  size: 16,
                                  color: shad.Theme.of(
                                    context,
                                  ).colorScheme.primary,
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            const shad.Gap(10),
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        ),
      ),
    );
  }
}
