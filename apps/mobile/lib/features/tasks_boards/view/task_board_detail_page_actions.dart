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
    Future<TaskBulkResult> Function() action, {
    bool closeOnSuccess = true,
  }) async {
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

      if (closeOnSuccess) {
        widget.onClose();
      }
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

  Future<void> _runBulkActionSequence(
    List<Future<TaskBulkResult> Function()> actions,
  ) async {
    if (actions.isEmpty) {
      return;
    }

    for (final action in actions) {
      if (!mounted) {
        return;
      }
      await _runBulkAction(action, closeOnSuccess: false);
    }

    if (mounted) {
      widget.onClose();
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

        // Priority options
        final priorityOptions = [
          _FilterMenuOption(
            id: 'critical',
            label: l10n.taskBoardDetailPriorityCritical,
            kind: _FilterMenuOptionKind.priority,
            foreground: _taskPriorityStyle(context, 'critical').foreground,
            background: _taskPriorityStyle(context, 'critical').background,
            border: _taskPriorityStyle(context, 'critical').border,
            icon: _taskPriorityStyle(context, 'critical').icon,
          ),
          _FilterMenuOption(
            id: 'high',
            label: l10n.taskBoardDetailPriorityHigh,
            kind: _FilterMenuOptionKind.priority,
            foreground: _taskPriorityStyle(context, 'high').foreground,
            background: _taskPriorityStyle(context, 'high').background,
            border: _taskPriorityStyle(context, 'high').border,
            icon: _taskPriorityStyle(context, 'high').icon,
          ),
          _FilterMenuOption(
            id: 'normal',
            label: l10n.taskBoardDetailPriorityNormal,
            kind: _FilterMenuOptionKind.priority,
            foreground: _taskPriorityStyle(context, 'normal').foreground,
            background: _taskPriorityStyle(context, 'normal').background,
            border: _taskPriorityStyle(context, 'normal').border,
            icon: _taskPriorityStyle(context, 'normal').icon,
          ),
          _FilterMenuOption(
            id: 'low',
            label: l10n.taskBoardDetailPriorityLow,
            kind: _FilterMenuOptionKind.priority,
            foreground: _taskPriorityStyle(context, 'low').foreground,
            background: _taskPriorityStyle(context, 'low').background,
            border: _taskPriorityStyle(context, 'low').border,
            icon: _taskPriorityStyle(context, 'low').icon,
          ),
        ];

        // Label options
        final labelOptions = board.labels
            .map(
              (label) => _FilterMenuOption(
                id: label.id,
                label: label.name.trim().isEmpty ? label.id : label.name,
                kind: _FilterMenuOptionKind.label,
                color: parseTaskLabelColor(label.color),
              ),
            )
            .toList(growable: false);

        // Project options
        final projectOptions = board.projects
            .map(
              (project) => _FilterMenuOption(
                id: project.id,
                label: project.name.trim().isEmpty ? project.id : project.name,
              ),
            )
            .toList(growable: false);

        // Assignee options
        final assigneeOptions = board.members
            .map(
              (member) => _FilterMenuOption(
                id: member.id,
                label: member.label,
                avatarUrl: member.avatarUrl,
              ),
            )
            .toList(growable: false);

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
                const shad.Gap(16),
                Expanded(
                  child: ListView(
                    children: [
                      // Quick Actions section - organized layout
                      if (hasDoneList || hasClosedList) ...[
                        _SectionContainer(
                          icon: Icons.flash_on_outlined,
                          children: [
                            // Status actions row: Mark as done & closed
                            // side by side
                            if (hasDoneList && hasClosedList)
                              Row(
                                children: [
                                  Expanded(
                                    child: shad.OutlineButton(
                                      enabled: canRun,
                                      leading: const Icon(
                                        Icons.check_circle_outline,
                                        size: 18,
                                      ),
                                      onPressed: () => unawaited(
                                        _runBulkAction(
                                          () => _cubit.bulkMoveToStatus('done'),
                                        ),
                                      ),
                                      child: Text(
                                        l10n.taskBoardDetailBulkMarkDone,
                                      ),
                                    ),
                                  ),
                                  const shad.Gap(8),
                                  Expanded(
                                    child: shad.OutlineButton(
                                      enabled: canRun,
                                      leading: const Icon(
                                        Icons.block_outlined,
                                        size: 18,
                                      ),
                                      onPressed: () => unawaited(
                                        _runBulkAction(
                                          () =>
                                              _cubit.bulkMoveToStatus('closed'),
                                        ),
                                      ),
                                      child: Text(
                                        l10n.taskBoardDetailBulkMarkClosed,
                                      ),
                                    ),
                                  ),
                                ],
                              )
                            else ...[
                              if (hasDoneList)
                                shad.OutlineButton(
                                  enabled: canRun,
                                  leading: const Icon(
                                    Icons.check_circle_outline,
                                    size: 18,
                                  ),
                                  onPressed: () => unawaited(
                                    _runBulkAction(
                                      () => _cubit.bulkMoveToStatus('done'),
                                    ),
                                  ),
                                  child: Text(l10n.taskBoardDetailBulkMarkDone),
                                ),
                              if (hasClosedList)
                                shad.OutlineButton(
                                  enabled: canRun,
                                  leading: const Icon(
                                    Icons.block_outlined,
                                    size: 18,
                                  ),
                                  onPressed: () => unawaited(
                                    _runBulkAction(
                                      () => _cubit.bulkMoveToStatus('closed'),
                                    ),
                                  ),
                                  child: Text(
                                    l10n.taskBoardDetailBulkMarkClosed,
                                  ),
                                ),
                            ],
                            // Delete action - full width with visual separation
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: shad.DestructiveButton(
                                enabled: canRun,
                                leading: const Icon(
                                  Icons.delete_outline,
                                  size: 18,
                                ),
                                onPressed: () => unawaited(
                                  _runBulkAction(
                                    () => _cubit.bulkDeleteSelectedTasks(),
                                  ),
                                ),
                                child: Text(
                                  l10n.taskBoardDetailDeleteTasks(
                                    selectedCount,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const shad.Gap(20),
                      ],

                      // Properties section - card with field grouping
                      _SectionContainer(
                        icon: Icons.tune_outlined,
                        children: [
                          // Priority
                          _FilterDropdownSection(
                            title: l10n.taskBoardDetailPriority,
                            options: priorityOptions,
                            selectedIds: const {},
                            enabled: canRun,
                            singleSelection: true,
                            onApplySelection: (selectedIds) {
                              if (selectedIds.isEmpty) return;
                              final priority = selectedIds.first;
                              unawaited(
                                _runBulkAction(
                                  () => _cubit.bulkUpdatePriority(priority),
                                ),
                              );
                            },
                          ),
                          const shad.Divider(height: 24),

                          // Due date - uses sheet instead of dropdown
                          _DueDateActionSection(
                            enabled: canRun,
                            onSelect: (preset, customDate) {
                              if (preset == 'custom' && customDate != null) {
                                unawaited(
                                  _runBulkAction(
                                    () => _cubit.bulkUpdateCustomDueDate(
                                      customDate,
                                    ),
                                  ),
                                );
                              } else if (preset != null) {
                                unawaited(
                                  _runBulkAction(
                                    () => _cubit.bulkUpdateDueDatePreset(
                                      preset,
                                      weekStartsOn: _firstDayOfWeek(context),
                                    ),
                                  ),
                                );
                              }
                            },
                          ),
                          if (board.estimationType?.trim().isNotEmpty == true)
                            const shad.Divider(height: 24),

                          // Estimation
                          if (board.estimationType?.trim().isNotEmpty == true)
                            _EstimationActionSection(
                              board: board,
                              enabled: canRun,
                              onSelect: (value) {
                                unawaited(
                                  _runBulkAction(
                                    () => _cubit.bulkUpdateEstimation(value),
                                  ),
                                );
                              },
                            ),
                          const shad.Divider(height: 24),

                          // Labels
                          _FilterDropdownSection(
                            title: l10n.taskBoardDetailTaskLabels,
                            options: labelOptions,
                            selectedIds: appliedLabelIds,
                            enabled: canRun,
                            onApplySelection: (selectedIds) {
                              if (selectedIds.isEmpty) {
                                unawaited(
                                  _runBulkActionSequence([
                                    _cubit.bulkClearLabels,
                                  ]),
                                );
                                return;
                              }

                              final actions =
                                  <Future<TaskBulkResult> Function()>[];
                              final toAdd = selectedIds.where(
                                (id) => !appliedLabelIds.contains(id),
                              );
                              final toRemove = appliedLabelIds.where(
                                (id) => !selectedIds.contains(id),
                              );
                              for (final id in toAdd) {
                                actions.add(() => _cubit.bulkAddLabel(id));
                              }
                              for (final id in toRemove) {
                                actions.add(() => _cubit.bulkRemoveLabel(id));
                              }
                              unawaited(_runBulkActionSequence(actions));
                            },
                          ),
                          const shad.Divider(height: 24),

                          // Projects
                          _FilterDropdownSection(
                            title: l10n.taskBoardDetailTaskProjects,
                            options: projectOptions,
                            selectedIds: appliedProjectIds,
                            enabled: canRun,
                            onApplySelection: (selectedIds) {
                              if (selectedIds.isEmpty) {
                                unawaited(
                                  _runBulkActionSequence([
                                    _cubit.bulkClearProjects,
                                  ]),
                                );
                                return;
                              }

                              final actions =
                                  <Future<TaskBulkResult> Function()>[];
                              final toAdd = selectedIds.where(
                                (id) => !appliedProjectIds.contains(id),
                              );
                              final toRemove = appliedProjectIds.where(
                                (id) => !selectedIds.contains(id),
                              );
                              for (final id in toAdd) {
                                actions.add(() => _cubit.bulkAddProject(id));
                              }
                              for (final id in toRemove) {
                                actions.add(() => _cubit.bulkRemoveProject(id));
                              }
                              unawaited(_runBulkActionSequence(actions));
                            },
                          ),
                          const shad.Divider(height: 24),

                          // Assignees
                          if (!_isPersonalWorkspaceForBoard(board)) ...[
                            _FilterDropdownSection(
                              title: l10n.taskBoardDetailTaskAssignees,
                              options: assigneeOptions,
                              selectedIds: appliedAssigneeIds,
                              enabled: canRun,
                              onApplySelection: (selectedIds) {
                                if (selectedIds.isEmpty) {
                                  unawaited(
                                    _runBulkActionSequence([
                                      _cubit.bulkClearAssignees,
                                    ]),
                                  );
                                  return;
                                }

                                final actions =
                                    <Future<TaskBulkResult> Function()>[];
                                final toAdd = selectedIds.where(
                                  (id) => !appliedAssigneeIds.contains(id),
                                );
                                final toRemove = appliedAssigneeIds.where(
                                  (id) => !selectedIds.contains(id),
                                );
                                for (final id in toAdd) {
                                  actions.add(() => _cubit.bulkAddAssignee(id));
                                }
                                for (final id in toRemove) {
                                  actions.add(
                                    () => _cubit.bulkRemoveAssignee(id),
                                  );
                                }
                                unawaited(_runBulkActionSequence(actions));
                              },
                            ),
                            const shad.Gap(8),
                          ],
                          shad.OutlineButton(
                            enabled: canRun && appliedAssigneeIds.isNotEmpty,
                            leading: const Icon(
                              Icons.person_remove_outlined,
                              size: 18,
                            ),
                            onPressed: () => unawaited(
                              _runBulkAction(_cubit.bulkClearAssignees),
                            ),
                            child: _CenteredButtonText(
                              l10n.taskBoardDetailBulkClearAssignees,
                            ),
                          ),
                        ],
                      ),
                      const shad.Gap(20),

                      // Move section - grouped container
                      _SectionContainer(
                        icon: Icons.drive_file_move_outlined,
                        children: [
                          // Move to list
                          _ListPickerSection(
                            title: l10n.taskBoardDetailMoveTask,
                            lists: board.lists,
                            enabled: canRun,
                            onSelect: (listId) {
                              unawaited(
                                _runBulkAction(
                                  () => _cubit.bulkMoveToList(listId: listId),
                                ),
                              );
                            },
                          ),
                          const shad.Divider(height: 24),

                          // Move to board
                          _MoveToBoardActionSection(
                            enabled: canRun,
                            cubit: _cubit,
                            onSelect: (boardId, listId) {
                              unawaited(
                                _runBulkAction(
                                  () => _cubit.bulkMoveToList(
                                    listId: listId,
                                    targetBoardId: boardId,
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
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
}

/// A container widget that groups related bulk action controls with visual
/// hierarchy through subtle background tint, border, and optional icon header.
class _SectionContainer extends StatelessWidget {
  const _SectionContainer({
    required this.children,
    this.icon,
  });

  final List<Widget> children;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.secondary.withAlpha(12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: colorScheme.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Optional icon header for visual distinction
          if (icon != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Icon(
                icon,
                size: 18,
                color: colorScheme.primary.withAlpha(180),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: _intersperseDividers(children),
            ),
          ),
        ],
      ),
    );
  }

  /// Removes adjacent dividers and ensures proper spacing
  List<Widget> _intersperseDividers(List<Widget> widgets) {
    final result = <Widget>[];
    for (var i = 0; i < widgets.length; i++) {
      final widget = widgets[i];
      // Skip consecutive dividers
      if (widget is shad.Divider &&
          result.isNotEmpty &&
          result.last is shad.Divider) {
        continue;
      }
      // Remove trailing divider
      if (widget is shad.Divider && i == widgets.length - 1) {
        continue;
      }
      result.add(widget);
    }
    return result;
  }
}

class _DueDateActionSection extends StatelessWidget {
  const _DueDateActionSection({
    required this.enabled,
    required this.onSelect,
  });

  final bool enabled;
  final void Function(String? preset, DateTime? customDate) onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.taskBoardDetailTaskEndDate,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(6),
        shad.OutlineButton(
          enabled: enabled,
          onPressed: () => unawaited(_showDueDateSheet(context)),
          child: Row(
            children: [
              Expanded(
                child: Text(l10n.taskBoardDetailSetDueDate),
              ),
              const shad.Gap(8),
              const Icon(Icons.keyboard_arrow_down, size: 16),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _showDueDateSheet(BuildContext context) async {
    final l10n = context.l10n;
    final choice = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.taskBoardDetailTaskEndDate,
                        style:
                            shad.Theme.of(
                              context,
                            ).typography.large.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ),
                    shad.IconButton.ghost(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(sheetContext).pop(),
                    ),
                  ],
                ),
                const shad.Gap(16),
                ListTile(
                  leading: const Icon(Icons.today),
                  title: Text(l10n.taskBoardDetailToday),
                  onTap: () => Navigator.of(sheetContext).pop('today'),
                ),
                ListTile(
                  leading: const Icon(Icons.event),
                  title: Text(l10n.taskBoardDetailTomorrow),
                  onTap: () => Navigator.of(sheetContext).pop('tomorrow'),
                ),
                ListTile(
                  leading: const Icon(Icons.date_range),
                  title: Text(l10n.taskBoardDetailThisWeek),
                  onTap: () => Navigator.of(sheetContext).pop('this_week'),
                ),
                ListTile(
                  leading: const Icon(Icons.calendar_view_week),
                  title: Text(l10n.taskBoardDetailNextWeek),
                  onTap: () => Navigator.of(sheetContext).pop('next_week'),
                ),
                const shad.Divider(),
                ListTile(
                  leading: const Icon(Icons.edit_calendar),
                  title: Text(l10n.taskBoardDetailSetCustomDate),
                  onTap: () => Navigator.of(sheetContext).pop('custom'),
                ),
                ListTile(
                  leading: Icon(
                    Icons.clear,
                    color: shad.Theme.of(context).colorScheme.destructive,
                  ),
                  title: Text(
                    l10n.taskBoardDetailRemoveDueDate,
                    style: TextStyle(
                      color: shad.Theme.of(context).colorScheme.destructive,
                    ),
                  ),
                  onTap: () => Navigator.of(sheetContext).pop('clear'),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (choice == null) return;

    if (choice == 'custom') {
      if (!context.mounted) return;
      final picked = await showDatePicker(
        context: context,
        initialDate: DateTime.now(),
        firstDate: DateTime(2000),
        lastDate: DateTime(2100),
      );
      if (picked != null) {
        onSelect('custom', picked);
      }
    } else {
      onSelect(choice, null);
    }
  }
}

class _EstimationActionSection extends StatelessWidget {
  const _EstimationActionSection({
    required this.board,
    required this.enabled,
    required this.onSelect,
  });

  final TaskBoardDetail board;
  final bool enabled;
  final void Function(int? value) onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.taskBoardDetailTaskEstimation,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(6),
        shad.OutlineButton(
          enabled: enabled,
          onPressed: () => unawaited(_showEstimationSheet(context)),
          child: Row(
            children: [
              Expanded(
                child: Text(l10n.taskBoardDetailSetEstimation),
              ),
              const shad.Gap(8),
              const Icon(Icons.keyboard_arrow_down, size: 16),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _showEstimationSheet(BuildContext context) async {
    final l10n = context.l10n;
    final options = _taskEstimationOptions(board);
    final choice = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.taskBoardDetailTaskEstimation,
                        style:
                            shad.Theme.of(
                              context,
                            ).typography.large.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ),
                    shad.IconButton.ghost(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(sheetContext).pop(),
                    ),
                  ],
                ),
                const shad.Gap(16),
                ListTile(
                  leading: const Icon(Icons.clear),
                  title: Text(l10n.taskBoardDetailTaskEstimationNone),
                  onTap: () => Navigator.of(sheetContext).pop('none'),
                ),
                const shad.Divider(),
                ...options.map(
                  (points) => ListTile(
                    leading: const Icon(Icons.speed),
                    title: Text(
                      _taskEstimationPointLabel(points: points, board: board),
                    ),
                    onTap: () => Navigator.of(sheetContext).pop('$points'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (choice == null) return;

    final value = choice == 'none' ? null : int.tryParse(choice);
    onSelect(value);
  }
}

class _MoveToBoardActionSection extends StatefulWidget {
  const _MoveToBoardActionSection({
    required this.enabled,
    required this.cubit,
    required this.onSelect,
  });

  final bool enabled;
  final TaskBoardDetailCubit cubit;
  final void Function(String boardId, String listId) onSelect;

  @override
  State<_MoveToBoardActionSection> createState() =>
      _MoveToBoardActionSectionState();
}

class _MoveToBoardActionSectionState extends State<_MoveToBoardActionSection> {
  bool _isLoading = false;
  List<TaskBoardSummary>? _cachedBoards;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        shad.OutlineButton(
          enabled: widget.enabled && !_isLoading,
          onPressed: () => unawaited(_handleMoveToBoard()),
          child: Row(
            children: [
              if (_isLoading)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              else
                const Icon(Icons.compare_arrows_outlined, size: 16),
              const shad.Gap(8),
              Expanded(
                child: Text(l10n.taskBoardDetailBulkMoveToBoard),
              ),
              if (!_isLoading) ...[
                const shad.Gap(8),
                const Icon(Icons.keyboard_arrow_down, size: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _handleMoveToBoard() async {
    final l10n = context.l10n;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final currentBoard = widget.cubit.state.board;
    if (currentBoard == null) return;

    // Use cached boards if available, otherwise fetch and cache
    List<TaskBoardSummary> boards;
    if (_cachedBoards != null) {
      boards = _cachedBoards!;
    } else {
      setState(() => _isLoading = true);
      try {
        boards = await widget.cubit.getTaskBoards();
        _cachedBoards = boards;
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
        return;
      } on Exception {
        if (!mounted || !toastContext.mounted) return;
        shad.showToast(
          context: toastContext,
          builder: (context, overlay) => shad.Alert.destructive(
            content: Text(l10n.commonSomethingWentWrong),
          ),
        );
        return;
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    }

    final candidateBoards = boards
        .where((board) => board.id != currentBoard.id)
        .toList(growable: false);
    if (candidateBoards.isEmpty) return;
    if (!mounted) return;

    final targetBoardId = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (sheetContext) => _BoardPickerSheet(
        title: l10n.taskBoardDetailBulkMoveToBoard,
        boards: candidateBoards,
      ),
    );
    if (targetBoardId == null || !mounted) return;

    setState(() => _isLoading = true);
    late final List<TaskBoardList> targetLists;
    try {
      targetLists = await widget.cubit.getBoardListsForBoard(targetBoardId);
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
      return;
    } on Exception {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(l10n.commonSomethingWentWrong),
        ),
      );
      return;
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
    if (!mounted) return;

    if (targetLists.isEmpty) return;

    final targetListId = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (sheetContext) => _ListPickerSheet(
        title: l10n.taskBoardDetailTaskListLabel,
        lists: _sortedListsByStatusOrder(targetLists),
      ),
    );
    if (targetListId == null || !mounted) return;

    widget.onSelect(targetBoardId, targetListId);
  }
}

class _ItemPickerSheet<T> extends StatelessWidget {
  const _ItemPickerSheet({
    required this.title,
    required this.items,
    required this.leadingBuilder,
    required this.labelBuilder,
    required this.onPicked,
  });

  final String title;
  final List<T> items;
  final Widget Function(BuildContext context, T item) leadingBuilder;
  final String Function(BuildContext context, T item) labelBuilder;
  final String Function(T item) onPicked;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: shad.Theme.of(
                      context,
                    ).typography.large.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                shad.IconButton.ghost(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const shad.Gap(16),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.5,
              ),
              child: ListView(
                shrinkWrap: true,
                children: items
                    .map(
                      (item) => ListTile(
                        leading: leadingBuilder(context, item),
                        title: Text(labelBuilder(context, item)),
                        onTap: () => Navigator.of(context).pop(onPicked(item)),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BoardPickerSheet extends StatelessWidget {
  const _BoardPickerSheet({
    required this.title,
    required this.boards,
  });

  final String title;
  final List<TaskBoardSummary> boards;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return _ItemPickerSheet<TaskBoardSummary>(
      title: title,
      items: boards,
      leadingBuilder: (_, board) => Icon(
        resolvePlatformIcon(
          board.icon,
          fallback: Icons.dashboard_outlined,
        ),
      ),
      labelBuilder: (_, board) => board.name?.trim().isNotEmpty == true
          ? board.name!.trim()
          : l10n.taskBoardDetailUntitledBoard,
      onPicked: (board) => board.id,
    );
  }
}

class _ListPickerSheet extends StatelessWidget {
  const _ListPickerSheet({
    required this.title,
    required this.lists,
  });

  final String title;
  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return _ItemPickerSheet<TaskBoardList>(
      title: title,
      items: lists,
      leadingBuilder: (context, list) => Icon(
        _taskBoardListStatusIcon(list.status),
        color: _taskBoardListStatusBadgeColors(
          context,
          list.status,
        ).textColor,
      ),
      labelBuilder: (_, list) => list.name?.trim().isNotEmpty == true
          ? list.name!.trim()
          : l10n.taskBoardDetailUntitledList,
      onPicked: (list) => list.id,
    );
  }
}
