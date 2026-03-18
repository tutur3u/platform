part of 'task_board_detail_page.dart';

class _TaskBoardDetailPageView extends StatefulWidget {
  const _TaskBoardDetailPageView({
    required this.boardId,
    this.initialTaskId,
  });

  final String boardId;
  final String? initialTaskId;

  @override
  State<_TaskBoardDetailPageView> createState() =>
      _TaskBoardDetailPageViewState();
}

class _TaskBoardDetailPageViewState extends State<_TaskBoardDetailPageView> {
  static const double _fabContentBottomPadding = 96;
  late final TextEditingController _searchController;
  final Set<String> _collapsedListIds = <String>{};
  String? _pendingInitialTaskId;
  bool _didHandleInitialTaskNavigation = false;
  bool _isHandlingInitialTaskNavigation = false;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
    final initialTaskId = widget.initialTaskId?.trim();
    _pendingInitialTaskId = (initialTaskId != null && initialTaskId.isNotEmpty)
        ? initialTaskId
        : null;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _TaskBoardDetailPageView oldWidget) {
    super.didUpdateWidget(oldWidget);

    final currentTaskId = widget.initialTaskId?.trim();
    final previousTaskId = oldWidget.initialTaskId?.trim();
    final normalizedCurrentTaskId =
        currentTaskId != null && currentTaskId.isNotEmpty
        ? currentTaskId
        : null;
    final normalizedPreviousTaskId =
        previousTaskId != null && previousTaskId.isNotEmpty
        ? previousTaskId
        : null;

    if (oldWidget.boardId != widget.boardId ||
        normalizedPreviousTaskId != normalizedCurrentTaskId) {
      _pendingInitialTaskId = normalizedCurrentTaskId;
      _didHandleInitialTaskNavigation = false;
      _isHandlingInitialTaskNavigation = false;
    }

    if (oldWidget.boardId != widget.boardId) {
      final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
      if (wsId != null) {
        unawaited(
          context.read<TaskBoardDetailCubit>().loadBoardDetail(
            wsId: wsId,
            boardId: widget.boardId,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.taskBoards);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
            buildWhen: (prev, curr) => prev.board != curr.board,
            builder: (context, state) {
              final title = state.board?.name?.trim().isNotEmpty == true
                  ? state.board!.name!.trim()
                  : context.l10n.taskBoardDetailUntitledBoard;
              return Text(title);
            },
          ),
          trailing: [
            BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
              buildWhen: (prev, curr) => prev.filters != curr.filters,
              builder: (context, state) {
                final hasActiveFilters = state.filters.hasAdvancedFilters;
                return Tooltip(
                  message: hasActiveFilters
                      ? context.l10n.taskBoardDetailFiltersActive
                      : context.l10n.taskBoardDetailFilters,
                  child: shad.IconButton.ghost(
                    icon: Icon(
                      hasActiveFilters
                          ? Icons.filter_alt
                          : Icons.filter_alt_outlined,
                    ),
                    onPressed: () => unawaited(
                      _openAdvancedFilterSheet(
                        context,
                        context.read<TaskBoardDetailCubit>().state,
                      ),
                    ),
                  ),
                );
              },
            ),
            PopupMenuButton<_BoardAction>(
              tooltip: context.l10n.taskBoardDetailBoardActions,
              onSelected: (action) => _handleBoardAction(context, action),
              itemBuilder: (context) => [
                PopupMenuItem<_BoardAction>(
                  value: _BoardAction.renameBoard,
                  child: Text(context.l10n.taskBoardDetailRenameBoard),
                ),
                PopupMenuItem<_BoardAction>(
                  value: _BoardAction.refresh,
                  child: Text(context.l10n.taskBoardDetailRefresh),
                ),
              ],
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: Icon(Icons.more_vert),
              ),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId == null) return;
          unawaited(
            context.read<TaskBoardDetailCubit>().loadBoardDetail(
              wsId: wsId,
              boardId: widget.boardId,
            ),
          );
        },
        child: BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
          builder: (context, state) {
            final detail = state.board;
            if (state.status == TaskBoardDetailStatus.loading &&
                detail == null) {
              return const Center(child: shad.CircularProgressIndicator());
            }

            if (state.status == TaskBoardDetailStatus.error && detail == null) {
              return _TaskBoardDetailErrorState(
                message: context.l10n.taskBoardDetailLoadError,
                onRetry: () => context.read<TaskBoardDetailCubit>().reload(),
              );
            }

            if (detail == null) {
              return _TaskBoardDetailErrorState(
                message: context.l10n.taskBoardDetailLoadError,
                onRetry: () => context.read<TaskBoardDetailCubit>().reload(),
              );
            }

            if (detail.lists.isEmpty) {
              return _NoListsState(
                onCreateList: () => unawaited(_openCreateListDialog(context)),
              );
            }

            final sortedLists = _sortedLists(detail.lists);
            final filteredByList = state.filteredTasksByListId;
            final bottomPadding =
                _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;
            final listIds = sortedLists.map((list) => list.id).toSet();
            _collapsedListIds.removeWhere((id) => !listIds.contains(id));
            if (_searchController.text != state.searchQuery) {
              _searchController.value = TextEditingValue(
                text: state.searchQuery,
                selection: TextSelection.collapsed(
                  offset: state.searchQuery.length,
                ),
              );
            }

            _maybeOpenInitialTask(
              context,
              detail: detail,
              lists: sortedLists,
            );

            return Stack(
              children: [
                ResponsiveWrapper(
                  maxWidth: ResponsivePadding.maxContentWidth(
                    context.deviceClass,
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            shad.Tabs(
                              index:
                                  state.currentView == TaskBoardDetailView.list
                                  ? 0
                                  : 1,
                              onChanged: (value) {
                                final nextView = value == 0
                                    ? TaskBoardDetailView.list
                                    : TaskBoardDetailView.kanban;
                                context.read<TaskBoardDetailCubit>().setView(
                                  nextView,
                                );
                              },
                              children: [
                                shad.TabItem(
                                  child: Text(
                                    context.l10n.taskBoardDetailListView,
                                  ),
                                ),
                                shad.TabItem(
                                  child: Text(
                                    context.l10n.taskBoardDetailKanbanView,
                                  ),
                                ),
                              ],
                            ),
                            const shad.Gap(10),
                            shad.TextField(
                              controller: _searchController,
                              hintText:
                                  context.l10n.taskBoardDetailSearchPlaceholder,
                              onChanged: (value) => context
                                  .read<TaskBoardDetailCubit>()
                                  .setSearchQuery(value),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: RefreshIndicator(
                          onRefresh: () =>
                              context.read<TaskBoardDetailCubit>().reload(),
                          child: state.currentView == TaskBoardDetailView.list
                              ? _buildListView(
                                  context,
                                  sortedLists,
                                  filteredByList,
                                  state,
                                  detail,
                                  bottomPadding,
                                )
                              : _buildKanbanView(
                                  context,
                                  sortedLists,
                                  filteredByList,
                                  state,
                                  detail,
                                  bottomPadding,
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
                SpeedDialFab(
                  label: context.l10n.taskBoardDetailCreateTask,
                  icon: Icons.add,
                  actions: [
                    FabAction(
                      icon: Icons.add_task,
                      label: context.l10n.taskBoardDetailCreateTask,
                      onPressed: () => unawaited(
                        _openTaskCreateSheet(
                          context,
                          lists: sortedLists,
                          defaultListId: sortedLists.first.id,
                        ),
                      ),
                    ),
                    FabAction(
                      icon: Icons.playlist_add,
                      label: context.l10n.taskBoardDetailCreateList,
                      onPressed: () =>
                          unawaited(_openCreateListDialog(context)),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  void _maybeOpenInitialTask(
    BuildContext context, {
    required TaskBoardDetail detail,
    required List<TaskBoardList> lists,
  }) {
    if (_didHandleInitialTaskNavigation || _isHandlingInitialTaskNavigation) {
      return;
    }
    final targetTaskId = _pendingInitialTaskId;
    if (targetTaskId == null) {
      _didHandleInitialTaskNavigation = true;
      return;
    }

    TaskBoardTask? matchedTask;
    for (final task in detail.tasks) {
      if (task.id == targetTaskId) {
        matchedTask = task;
        break;
      }
    }

    if (matchedTask == null) return;

    _isHandlingInitialTaskNavigation = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(_openInitialTaskDetails(context, matchedTask!, lists));
    });
  }

  Future<void> _openInitialTaskDetails(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    try {
      await _openTaskDetails(context, task, lists);
      if (mounted) {
        _pendingInitialTaskId = null;
        _didHandleInitialTaskNavigation = true;
      }
    } on Exception {
      // Keep pending task id for a future retry.
    } finally {
      if (mounted) {
        _isHandlingInitialTaskNavigation = false;
      }
    }
  }

  Widget _buildListView(
    BuildContext context,
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByList,
    TaskBoardDetailState state,
    TaskBoardDetail board,
    double bottomPadding,
  ) {
    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        children: [
          shad.Card(
            child: Text(context.l10n.taskBoardDetailNoMatchingTasks),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
      itemCount: lists.length,
      separatorBuilder: (_, _) => const shad.Gap(12),
      itemBuilder: (context, index) {
        final list = lists[index];
        final listTasks = tasksByList[list.id] ?? const <TaskBoardTask>[];
        return _BoardListSection(
          board: board,
          list: list,
          tasks: listTasks,
          isExpanded: !_collapsedListIds.contains(list.id),
          collapsible: true,
          onToggleExpanded: () {
            setState(() {
              if (_collapsedListIds.contains(list.id)) {
                _collapsedListIds.remove(list.id);
              } else {
                _collapsedListIds.add(list.id);
              }
            });
          },
          onTaskTap: (task) =>
              unawaited(_openTaskDetails(context, task, lists)),
          onTaskMove: (task) => _openMoveTaskPicker(context, task, lists),
          onCreateTask: () => unawaited(
            _openTaskCreateSheet(
              context,
              lists: lists,
              defaultListId: list.id,
            ),
          ),
          onEditList: () => unawaited(_openEditListDialog(context, list)),
        );
      },
    );
  }

  Widget _buildKanbanView(
    BuildContext context,
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByList,
    TaskBoardDetailState state,
    TaskBoardDetail board,
    double bottomPadding,
  ) {
    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        children: [
          shad.Card(
            child: Text(context.l10n.taskBoardDetailNoMatchingTasks),
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.only(bottom: bottomPadding),
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: lists
                .map(
                  (list) => Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: _KanbanColumn(
                      board: board,
                      list: list,
                      tasks: tasksByList[list.id] ?? const <TaskBoardTask>[],
                      onTaskTap: (task) => unawaited(
                        _openTaskDetails(context, task, lists),
                      ),
                      onTaskMove: (task) =>
                          _openMoveTaskPicker(context, task, lists),
                      onCreateTask: () => unawaited(
                        _openTaskCreateSheet(
                          context,
                          lists: lists,
                          defaultListId: list.id,
                        ),
                      ),
                      onEditList: () =>
                          unawaited(_openEditListDialog(context, list)),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
      ],
    );
  }

  Future<void> _openTaskDetails(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    final parentContext = context;
    final board = parentContext.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;
    final content = BlocProvider.value(
      value: parentContext.read<TaskBoardDetailCubit>(),
      child: _TaskBoardTaskDetailSheet(
        task: task,
        board: board,
        lists: lists,
        labels: board.labels,
        members: board.members,
        projects: board.projects,
      ),
    );

    if (context.isCompact) {
      await shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: (_) => content,
      );
      return;
    }

    await shad.showDialog<void>(
      context: context,
      builder: (_) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: content,
        ),
      ),
    );
  }

  Future<void> _openTaskCreateSheet(
    BuildContext context, {
    required List<TaskBoardList> lists,
    String? defaultListId,
  }) async {
    final parentContext = context;
    if (lists.isEmpty) return;
    final board = parentContext.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return;
    final normalizedDefaultListId =
        defaultListId != null && lists.any((list) => list.id == defaultListId)
        ? defaultListId
        : lists.first.id;

    final content = BlocProvider.value(
      value: parentContext.read<TaskBoardDetailCubit>(),
      child: _TaskBoardTaskEditorSheet(
        task: null,
        board: board,
        lists: lists,
        defaultListId: normalizedDefaultListId,
        labels: board.labels,
        members: board.members,
        projects: board.projects,
      ),
    );

    if (context.isCompact) {
      await shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: (_) => content,
      );
      return;
    }

    await shad.showDialog<void>(
      context: context,
      builder: (_) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: content,
        ),
      ),
    );
  }

  Future<void> _openMoveTaskPicker(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
  ) async {
    final availableLists = lists
        .where((list) => list.id != task.listId)
        .toList(growable: false);
    if (availableLists.isEmpty) {
      return;
    }

    final selectedListId = await shad.showDialog<String>(
      context: context,
      builder: (dialogContext) => _MoveTaskListDialog(lists: availableLists),
    );

    if (selectedListId == null || !context.mounted) return;

    final cubit = context.read<TaskBoardDetailCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    final taskMovedMessage = context.l10n.taskBoardDetailTaskMoved;

    try {
      await cubit.moveTask(taskId: task.id, listId: selectedListId);
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(taskMovedMessage)),
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
