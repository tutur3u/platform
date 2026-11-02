part of 'task_board_detail_page.dart';

extension on _TaskBoardDetailPageViewState {
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
                  await cubit.restoreTask(taskId: taskId, reloadBoard: false);
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
                              const Icon(Icons.delete_outline, size: 20),
                              const shad.Gap(8),
                              Text(
                                context.l10n.taskBoardDetailRecycleBin,
                                style: shad.Theme.of(context).typography.large
                                    .copyWith(fontWeight: FontWeight.w700),
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
                        child: AppLoadingIndicator(),
                      )
                    else if (errorMessage.trim().isNotEmpty)
                      Flexible(
                        // Plain indicator + shrink-wrapped scrollable: the
                        // compact sheet must not grow to its max height.
                        child: NovaRefreshIndicator(
                          onRefresh: () => loadDeletedTasks(forceRefresh: true),
                          child: SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            child: shad.Card(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(errorMessage),
                                  const shad.Gap(10),
                                  shad.OutlineButton(
                                    onPressed: isMutating
                                        ? null
                                        : () => unawaited(
                                            loadDeletedTasks(
                                              forceRefresh: true,
                                            ),
                                          ),
                                    child: Text(context.l10n.commonRetry),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      )
                    else if (deletedTasks.isEmpty)
                      Flexible(
                        child: NovaRefreshIndicator(
                          onRefresh: () => loadDeletedTasks(forceRefresh: true),
                          child: SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            child: Padding(
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
                                      context
                                          .l10n
                                          .taskBoardDetailRecycleBinEmpty,
                                      style: shad.Theme.of(context)
                                          .typography
                                          .small
                                          .copyWith(
                                            color: shad.Theme.of(
                                              context,
                                            ).colorScheme.mutedForeground,
                                          ),
                                    ),
                                    const shad.Gap(4),
                                    Text(
                                      context
                                          .l10n
                                          .taskBoardDetailRecycleBinEmptyHint,
                                      style: shad.Theme.of(context)
                                          .typography
                                          .small
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
                            ),
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
                                        .copyWith(fontWeight: FontWeight.w500),
                                  ),
                                ],
                              ),
                            ),
                            // Task list
                            Flexible(
                              child: NovaRefreshIndicator(
                                onRefresh: () =>
                                    loadDeletedTasks(forceRefresh: true),
                                child: ListView.separated(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
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
}
