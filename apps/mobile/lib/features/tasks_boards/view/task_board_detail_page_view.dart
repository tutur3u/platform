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
  late final ScrollController _listScrollController;
  late final ScrollController _kanbanVerticalScrollController;
  late final ScrollController _kanbanHorizontalScrollController;
  final Set<String> _collapsedListIds = <String>{};
  String? _pendingInitialTaskId;
  bool _didHandleInitialTaskNavigation = false;
  bool _isHandlingInitialTaskNavigation = false;
  bool _showSearchField = false;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
    _listScrollController = ScrollController();
    _kanbanVerticalScrollController = ScrollController();
    _kanbanHorizontalScrollController = ScrollController();
    final initialTaskId = widget.initialTaskId?.trim();
    _pendingInitialTaskId = (initialTaskId != null && initialTaskId.isNotEmpty)
        ? initialTaskId
        : null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _tryOpenInitialTaskFromState();
    });
  }

  @override
  void dispose() {
    _listScrollController.dispose();
    _kanbanVerticalScrollController.dispose();
    _kanbanHorizontalScrollController.dispose();
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
      _tryOpenInitialTaskFromState();
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
    return BlocListener<WorkspaceCubit, WorkspaceState>(
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
      child: BlocListener<TaskBoardDetailCubit, TaskBoardDetailState>(
        listenWhen: (_, curr) => curr.board != null,
        listener: (context, state) {
          final detail = state.board;
          if (detail == null || detail.lists.isEmpty) {
            return;
          }

          _maybeOpenInitialTask(
            context,
            detail: detail,
            lists: _sortedLists(detail.lists),
          );
        },
        child: BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
          buildWhen: (previous, current) =>
              previous.status != current.status ||
              previous.board != current.board ||
              previous.currentView != current.currentView ||
              previous.searchQuery != current.searchQuery ||
              previous.filters != current.filters ||
              previous.taskDescriptionSearchIndex !=
                  current.taskDescriptionSearchIndex,
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
            final searchFieldVisible =
                _showSearchField || state.searchQuery.trim().isNotEmpty;

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
                            _TaskBoardDetailToolbarCard(
                              title: detail.name?.trim().isNotEmpty == true
                                  ? detail.name!.trim()
                                  : context.l10n.taskBoardDetailUntitledBoard,
                              hasActiveFilters:
                                  state.filters.hasAdvancedFilters,
                              onBack: () {
                                final router = GoRouter.of(context);
                                if (router.canPop()) {
                                  router.pop();
                                  return;
                                }
                                context.go(Routes.taskBoards);
                              },
                              onOpenFilters: () => unawaited(
                                _openAdvancedFilterSheet(
                                  context,
                                  context.read<TaskBoardDetailCubit>().state,
                                ),
                              ),
                              onSelectedAction: (action) =>
                                  _handleBoardAction(context, action),
                            ),
                            const shad.Gap(12),
                            Row(
                              children: [
                                Expanded(
                                  child: shad.Tabs(
                                    expand: true,
                                    index:
                                        state.currentView ==
                                            TaskBoardDetailView.kanban
                                        ? 0
                                        : 1,
                                    onChanged: (value) {
                                      final nextView = value == 0
                                          ? TaskBoardDetailView.kanban
                                          : TaskBoardDetailView.list;
                                      context
                                          .read<TaskBoardDetailCubit>()
                                          .setView(nextView);
                                    },
                                    children: [
                                      shad.TabItem(
                                        child: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Icon(
                                                LucideIcons.squareKanban,
                                              ),
                                              const shad.Gap(5),
                                              Text(
                                                context
                                                    .l10n
                                                    .taskBoardDetailKanbanView,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      shad.TabItem(
                                        child: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Icon(LucideIcons.list),
                                              const shad.Gap(5),
                                              Text(
                                                context
                                                    .l10n
                                                    .taskBoardDetailListView,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const shad.Gap(8),
                                shad.IconButton.ghost(
                                  icon: Icon(
                                    searchFieldVisible
                                        ? Icons.close
                                        : Icons.search,
                                  ),
                                  onPressed: () {
                                    final cubit = context
                                        .read<TaskBoardDetailCubit>();
                                    if (searchFieldVisible) {
                                      setState(() => _showSearchField = false);
                                      _searchController.clear();
                                      cubit.setSearchQuery('');
                                      return;
                                    }
                                    setState(() => _showSearchField = true);
                                  },
                                ),
                              ],
                            ),
                            if (searchFieldVisible) ...[
                              const shad.Gap(10),
                              shad.TextField(
                                controller: _searchController,
                                hintText: context
                                    .l10n
                                    .taskBoardDetailSearchPlaceholder,
                                onChanged: (value) => context
                                    .read<TaskBoardDetailCubit>()
                                    .setSearchQuery(value),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Expanded(
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            return RefreshIndicator(
                              onRefresh: () =>
                                  context.read<TaskBoardDetailCubit>().reload(),
                              child:
                                  state.currentView == TaskBoardDetailView.list
                                  ? _buildListView(
                                      context,
                                      sortedLists,
                                      filteredByList,
                                      state,
                                      detail,
                                      bottomPadding,
                                      constraints.maxHeight,
                                    )
                                  : _buildKanbanView(
                                      context,
                                      sortedLists,
                                      filteredByList,
                                      state,
                                      detail,
                                      bottomPadding,
                                      constraints.maxHeight,
                                    ),
                            );
                          },
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

  void _tryOpenInitialTaskFromState() {
    final detail = context.read<TaskBoardDetailCubit>().state.board;
    if (detail == null || detail.lists.isEmpty) {
      return;
    }

    _maybeOpenInitialTask(
      context,
      detail: detail,
      lists: _sortedLists(detail.lists),
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
    double viewportHeight,
  ) {
    final pageSizeHint = _tasksPageSizeHintForViewport(viewportHeight);

    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      if (state.isLoadingListTasks) {
        return ListView(
          key: PageStorageKey<String>(
            'task-board-list-empty-${widget.boardId}',
          ),
          controller: _listScrollController,
          primary: false,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
          children: [
            shad.Card(
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: shad.CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const shad.Gap(10),
                  Text(context.l10n.notificationsLoadingMore),
                ],
              ),
            ),
          ],
        );
      }

      return ListView(
        key: PageStorageKey<String>(
          'task-board-list-empty-${widget.boardId}',
        ),
        controller: _listScrollController,
        primary: false,
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
      key: PageStorageKey<String>('task-board-list-${widget.boardId}'),
      controller: _listScrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
      itemCount: lists.length,
      separatorBuilder: (_, _) => const shad.Gap(12),
      itemBuilder: (context, index) {
        final list = lists[index];
        unawaited(
          context.read<TaskBoardDetailCubit>().loadListTasks(
            listId: list.id,
            pageSizeHint: pageSizeHint,
          ),
        );
        final listTasks = tasksByList[list.id] ?? const <TaskBoardTask>[];
        return _BoardListSection(
          board: board,
          list: list,
          tasks: listTasks,
          isTasksLoaded: state.loadedListIds.contains(list.id),
          isLoadingTasks: state.loadingListIds.contains(list.id),
          hasMoreTasks: state.listHasMoreById[list.id] ?? true,
          onLoadMoreTasks: () => unawaited(
            context.read<TaskBoardDetailCubit>().loadListTasks(
              listId: list.id,
              loadMore: true,
              pageSizeHint: pageSizeHint,
            ),
          ),
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
    double viewportHeight,
  ) {
    final pageSizeHint = _tasksPageSizeHintForViewport(viewportHeight);

    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      if (state.isLoadingListTasks) {
        return ListView(
          key: PageStorageKey<String>(
            'task-board-kanban-empty-${widget.boardId}',
          ),
          controller: _kanbanVerticalScrollController,
          primary: false,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
          children: [
            shad.Card(
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: shad.CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const shad.Gap(10),
                  Text(context.l10n.notificationsLoadingMore),
                ],
              ),
            ),
          ],
        );
      }

      return ListView(
        key: PageStorageKey<String>(
          'task-board-kanban-empty-${widget.boardId}',
        ),
        controller: _kanbanVerticalScrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        children: [
          shad.Card(
            child: Text(context.l10n.taskBoardDetailNoMatchingTasks),
          ),
        ],
      );
    }

    final columnHeight = viewportHeight.clamp(280.0, 2000.0);

    return ListView(
      key: PageStorageKey<String>('task-board-kanban-${widget.boardId}'),
      controller: _kanbanVerticalScrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        SizedBox(
          height: columnHeight,
          child: ListView.separated(
            key: PageStorageKey<String>(
              'task-board-kanban-horizontal-${widget.boardId}',
            ),
            controller: _kanbanHorizontalScrollController,
            primary: false,
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: lists.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final list = lists[index];
              unawaited(
                context.read<TaskBoardDetailCubit>().loadListTasks(
                  listId: list.id,
                  pageSizeHint: pageSizeHint,
                ),
              );
              return _KanbanColumn(
                board: board,
                list: list,
                tasks: tasksByList[list.id] ?? const <TaskBoardTask>[],
                isTasksLoaded: state.loadedListIds.contains(list.id),
                height: columnHeight,
                isLoadingTasks: state.loadingListIds.contains(list.id),
                hasMoreTasks: state.listHasMoreById[list.id] ?? true,
                onLoadMoreTasks: () => unawaited(
                  context.read<TaskBoardDetailCubit>().loadListTasks(
                    listId: list.id,
                    loadMore: true,
                    pageSizeHint: pageSizeHint,
                  ),
                ),
                onTaskTap: (task) => unawaited(
                  _openTaskDetails(context, task, lists),
                ),
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
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
        ),
      ],
    );
  }

  int _tasksPageSizeHintForViewport(double viewportHeight) {
    const estimatedTileHeight = 180.0;
    const prefetchScrollWindows = 3;
    final safeHeight = viewportHeight <= 0 ? 640.0 : viewportHeight;
    final estimatedVisibleItems = (safeHeight / estimatedTileHeight).ceil();
    final hinted = estimatedVisibleItems * prefetchScrollWindows;
    return hinted.clamp(12, 80);
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

    await showAdaptiveDrawer(context: context, builder: (_) => content);
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

    await showAdaptiveDrawer(context: context, builder: (_) => content);
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

class _TaskBoardDetailToolbarCard extends StatelessWidget {
  const _TaskBoardDetailToolbarCard({
    required this.title,
    required this.hasActiveFilters,
    required this.onBack,
    required this.onOpenFilters,
    required this.onSelectedAction,
  });

  final String title;
  final bool hasActiveFilters;
  final VoidCallback onBack;
  final VoidCallback onOpenFilters;
  final ValueChanged<_BoardAction> onSelectedAction;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: onBack,
              child: const Icon(Icons.arrow_back),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Tooltip(
              message: hasActiveFilters
                  ? context.l10n.taskBoardDetailFiltersActive
                  : context.l10n.taskBoardDetailFilters,
              child: shad.IconButton.ghost(
                icon: Icon(
                  hasActiveFilters
                      ? Icons.filter_alt
                      : Icons.filter_alt_outlined,
                ),
                onPressed: onOpenFilters,
              ),
            ),
            PopupMenuButton<_BoardAction>(
              tooltip: context.l10n.taskBoardDetailBoardActions,
              onSelected: onSelectedAction,
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
      ),
    );
  }
}
