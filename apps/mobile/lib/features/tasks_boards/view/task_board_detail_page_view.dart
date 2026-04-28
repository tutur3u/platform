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

class _TaskBoardKanbanView extends StatelessWidget {
  const _TaskBoardKanbanView({
    required this.boardId,
    required this.lists,
    required this.tasksByList,
    required this.state,
    required this.board,
    required this.bottomPadding,
    required this.viewportHeight,
    required this.kanbanVerticalScrollController,
    required this.kanbanHorizontalPageController,
    required this.onRequestInitialLoad,
    required this.onRequestListWindowLoad,
    required this.onLoadMore,
    required this.onRetryLoad,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.isBulkSelectMode,
    required this.selectedTaskIds,
    required this.onToggleTaskSelection,
    required this.onCreateTask,
    required this.onEditList,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final double bottomPadding;
  final double viewportHeight;
  final ScrollController kanbanVerticalScrollController;
  final PageController kanbanHorizontalPageController;
  final void Function(
    String listId,
    int pageSizeHint,
    TaskBoardDetailState state,
  )
  onRequestInitialLoad;
  final void Function(
    int focusedIndex,
    int pageSizeHint,
    TaskBoardDetailState state,
  )
  onRequestListWindowLoad;
  final Future<void> Function(String listId, int pageSizeHint) onLoadMore;
  final Future<void> Function(String listId, int pageSizeHint) onRetryLoad;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final Future<void> Function(TaskBoardTask task) onTaskMove;
  final bool isBulkSelectMode;
  final Set<String> selectedTaskIds;
  final void Function(TaskBoardTask task) onToggleTaskSelection;
  final Future<void> Function(String? listId) onCreateTask;
  final Future<void> Function(TaskBoardList list) onEditList;

  @override
  Widget build(BuildContext context) {
    final pageSizeHint = _tasksPageSizeHintForViewport(viewportHeight);

    if (state.filteredTasks.isEmpty &&
        (state.searchQuery.trim().isNotEmpty ||
            state.filters.hasAdvancedFilters)) {
      if (state.isLoadingListTasks) {
        return ListView(
          key: PageStorageKey<String>('task-board-kanban-empty-$boardId'),
          controller: kanbanVerticalScrollController,
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
        key: PageStorageKey<String>('task-board-kanban-empty-$boardId'),
        controller: kanbanVerticalScrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        children: [
          if (state.listLoadErrorById.isNotEmpty)
            shad.Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.commonSomethingWentWrong),
                  const shad.Gap(10),
                  shad.OutlineButton(
                    onPressed: () => unawaited(
                      context
                          .read<TaskBoardDetailCubit>()
                          .ensureAllListsLoaded(),
                    ),
                    child: Text(context.l10n.commonRetry),
                  ),
                ],
              ),
            )
          else
            shad.Card(child: Text(context.l10n.taskBoardDetailNoMatchingTasks)),
        ],
      );
    }

    final columnHeight = viewportHeight.clamp(280.0, 2000.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        final compactWidth = math.max<double>(288, viewportWidth - 24);
        final wideWidth = math.min<double>(
          math.max<double>(viewportWidth * 0.82, 340),
          560,
        );
        final columnWidth = context.isCompact ? compactWidth : wideWidth;

        return ListView(
          key: PageStorageKey<String>('task-board-kanban-$boardId'),
          controller: kanbanVerticalScrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.only(bottom: bottomPadding),
          children: [
            SizedBox(
              height: columnHeight,
              child: PageView.builder(
                key: PageStorageKey<String>(
                  'task-board-kanban-horizontal-$boardId',
                ),
                controller: kanbanHorizontalPageController,
                physics: const BouncingScrollPhysics(),
                itemCount: lists.length,
                onPageChanged: (index) {
                  onRequestListWindowLoad(index, pageSizeHint, state);
                },
                itemBuilder: (context, index) {
                  final list = lists[index];
                  onRequestInitialLoad(list.id, pageSizeHint, state);
                  final hasLoadError = state.listLoadErrorById.containsKey(
                    list.id,
                  );
                  final listTasks =
                      tasksByList[list.id] ?? const <TaskBoardTask>[];
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: SizedBox(
                        width: columnWidth,
                        child: _KanbanColumn(
                          board: board,
                          list: list,
                          tasks: listTasks,
                          isTasksLoaded: state.loadedListIds.contains(list.id),
                          height: columnHeight,
                          isLoadingTasks: state.loadingListIds.contains(
                            list.id,
                          ),
                          hasLoadError: hasLoadError,
                          hasMoreTasks: state.listHasMoreById[list.id] ?? true,
                          onLoadMoreTasks: hasLoadError && listTasks.isEmpty
                              ? () => unawaited(
                                  onRetryLoad(list.id, pageSizeHint),
                                )
                              : () => unawaited(
                                  onLoadMore(list.id, pageSizeHint),
                                ),
                          onTaskTap: (task) => unawaited(onTaskTap(task)),
                          onTaskMove: (task) => unawaited(onTaskMove(task)),
                          isBulkSelectMode: isBulkSelectMode,
                          selectedTaskIds: selectedTaskIds,
                          onToggleTaskSelection: onToggleTaskSelection,
                          onCreateTask: () => unawaited(onCreateTask(list.id)),
                          onEditList: () => unawaited(onEditList(list)),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

int _tasksPageSizeHintForViewport(double viewportHeight) {
  const estimatedTileHeight = 180.0;
  const prefetchScrollWindows = 3;
  final safeHeight = viewportHeight <= 0 ? 640.0 : viewportHeight;
  final estimatedVisibleItems = (safeHeight / estimatedTileHeight).ceil();
  final hinted = estimatedVisibleItems * prefetchScrollWindows;
  return hinted.clamp(12, 80);
}

class _TaskQuickCreateFab extends StatelessWidget {
  const _TaskQuickCreateFab({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final safeAreaPadding = MediaQuery.paddingOf(context);

    return Positioned(
      right: 16 + safeAreaPadding.right,
      bottom: 16,
      child: Tooltip(
        message: label,
        child: Semantics(
          label: label,
          button: true,
          child: SizedBox.square(
            dimension: 56,
            child: shad.PrimaryButton(
              onPressed: onPressed,
              shape: shad.ButtonShape.circle,
              density: shad.ButtonDensity.icon,
              child: const Center(child: Icon(Icons.add, size: 24)),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskBoardDetailPageViewState extends State<_TaskBoardDetailPageView> {
  static const double _fabContentBottomPadding = 96;
  final Map<String, double> _savedScrollOffsets = <String, double>{};
  final Map<String, int> _savedKanbanPages = <String, int>{};
  late final TextEditingController _searchController;
  late final ScrollController _listScrollController;
  late final ScrollController _kanbanVerticalScrollController;
  late final PageController _kanbanHorizontalPageController;
  late final ScrollController _timelineVerticalScrollController;
  late final ScrollController _timelineHorizontalScrollController;
  final Set<String> _collapsedListIds = <String>{};
  final Set<String> _initialListLoadRequested = <String>{};
  String? _initialListLoadBoardKey;
  String? _selectedTaskId;

  bool _isPersonalWorkspaceForBoard(
    BuildContext context,
    TaskBoardDetail board,
  ) {
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
  void initState() {
    super.initState();
    _searchController = TextEditingController();
    _listScrollController = ScrollController(
      initialScrollOffset: _savedOffset('list'),
    );
    _kanbanVerticalScrollController = ScrollController(
      initialScrollOffset: _savedOffset('kanban-vertical'),
    );
    _kanbanHorizontalPageController = PageController(
      initialPage: _savedKanbanPages[widget.boardId] ?? 0,
    );
    _timelineVerticalScrollController = ScrollController(
      initialScrollOffset: _savedOffset('timeline-vertical'),
    );
    _timelineHorizontalScrollController = ScrollController(
      initialScrollOffset: _savedOffset('timeline-horizontal'),
    );
    _selectedTaskId = _normalizedTaskId(widget.initialTaskId);
  }

  @override
  void dispose() {
    _rememberScrollOffsets();
    _listScrollController.dispose();
    _kanbanVerticalScrollController.dispose();
    _kanbanHorizontalPageController.dispose();
    _timelineVerticalScrollController.dispose();
    _timelineHorizontalScrollController.dispose();
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
      _initialListLoadRequested.clear();
      _initialListLoadBoardKey = null;
      _selectedTaskId = normalizedCurrentTaskId;
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
      _restoreScrollOffsetsForCurrentBoard();
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
        context.go(Routes.taskBoards);
      },
      child: BlocBuilder<TaskBoardDetailCubit, TaskBoardDetailState>(
        buildWhen: (previous, current) =>
            previous.status != current.status ||
            previous.board != current.board ||
            previous.currentView != current.currentView ||
            previous.searchQuery != current.searchQuery ||
            previous.filters != current.filters ||
            previous.loadingListIds != current.loadingListIds ||
            previous.isBulkSelectMode != current.isBulkSelectMode ||
            previous.selectedTaskIds != current.selectedTaskIds ||
            previous.taskDescriptionSearchIndex !=
                current.taskDescriptionSearchIndex,
        builder: (context, state) {
          final detail = state.board;
          final boardRoute = Routes.taskBoardDetailPath(widget.boardId);
          final selectedCount = state.selectedTaskIds.length;
          final shellActionRegistration = ShellChromeActions(
            ownerId: 'task-board-detail-${widget.boardId}',
            locations: {boardRoute},
            actions: [
              ShellActionSpec(
                id: 'task-board-detail-bulk-select',
                icon: state.isBulkSelectMode
                    ? Icons.checklist
                    : Icons.checklist_rtl,
                tooltip: state.isBulkSelectMode
                    ? context.l10n.taskBoardDetailExitBulkSelect
                    : context.l10n.taskBoardDetailEnterBulkSelect,
                highlighted: state.isBulkSelectMode,
                enabled: detail != null,
                onPressed: () {
                  final cubit = context.read<TaskBoardDetailCubit>();
                  if (state.isBulkSelectMode) {
                    cubit.exitBulkSelectMode();
                  } else {
                    cubit.enterBulkSelectMode();
                  }
                },
              ),
              ShellActionSpec(
                id: 'task-board-detail-search',
                icon: Icons.search,
                tooltip: context.l10n.taskBoardDetailSearchTitle,
                highlighted: state.searchQuery.trim().isNotEmpty,
                enabled: detail != null,
                onPressed: () => unawaited(_openSearchSheet(context)),
              ),
              ShellActionSpec(
                id: 'task-board-detail-filter',
                icon: state.filters.hasAdvancedFilters
                    ? Icons.filter_alt
                    : Icons.filter_alt_outlined,
                tooltip: state.filters.hasAdvancedFilters
                    ? context.l10n.taskBoardDetailFiltersActive
                    : context.l10n.taskBoardDetailFilters,
                highlighted: state.filters.hasAdvancedFilters,
                enabled: detail != null,
                onPressed: () => unawaited(
                  _openAdvancedFilterSheet(
                    context,
                    context.read<TaskBoardDetailCubit>().state,
                  ),
                ),
              ),
              ShellActionSpec(
                id: 'task-board-detail-actions',
                icon: Icons.more_vert,
                tooltip: context.l10n.taskBoardDetailBoardActions,
                enabled: detail != null,
                onPressed: () => unawaited(_showBoardActionsSheet(context)),
              ),
              if (state.isBulkSelectMode)
                ShellActionSpec(
                  id: 'task-board-detail-bulk-actions',
                  icon: Icons.tune,
                  tooltip: context.l10n.taskBoardDetailBulkActions,
                  highlighted: selectedCount > 0,
                  enabled: detail != null,
                  onPressed: () => unawaited(_openBulkActionsSheet(context)),
                ),
            ],
          );
          final shellMiniNavRegistration = ShellMiniNav(
            ownerId: 'task-board-mini-nav-${widget.boardId}',
            locations: {boardRoute},
            deepLinkBackRoute: Routes.taskBoards,
            items: [
              ShellMiniNavItemSpec(
                id: 'back',
                icon: Icons.chevron_left,
                label: context.l10n.navBack,
                callbackToken: 'back',
                onPressed: () => context.go(Routes.taskBoards),
              ),
              ShellMiniNavItemSpec(
                id: 'kanban',
                icon: Icons.view_kanban_outlined,
                label: context.l10n.taskBoardDetailKanbanView,
                selected: state.currentView == TaskBoardDetailView.kanban,
                callbackToken: 'kanban-${state.currentView.name}',
                onPressed: () =>
                    _setBoardView(context, TaskBoardDetailView.kanban),
              ),
              ShellMiniNavItemSpec(
                id: 'list',
                icon: Icons.view_list_outlined,
                label: context.l10n.taskBoardDetailListView,
                selected: state.currentView == TaskBoardDetailView.list,
                callbackToken: 'list-${state.currentView.name}',
                onPressed: () =>
                    _setBoardView(context, TaskBoardDetailView.list),
              ),
              ShellMiniNavItemSpec(
                id: 'timeline',
                icon: Icons.timeline_outlined,
                label: context.l10n.taskBoardDetailTimelineView,
                selected: state.currentView == TaskBoardDetailView.timeline,
                callbackToken: 'timeline-${state.currentView.name}',
                onPressed: () =>
                    _setBoardView(context, TaskBoardDetailView.timeline),
              ),
            ],
          );
          final shellTitleRegistration = detail == null
              ? const SizedBox.shrink()
              : ShellTitleOverride(
                  ownerId: 'task-board-title-${widget.boardId}',
                  locations: {boardRoute},
                  title: detail.name?.trim().isNotEmpty == true
                      ? detail.name!.trim()
                      : context.l10n.taskBoardDetailUntitledBoard,
                );

          if (state.status == TaskBoardDetailStatus.loading && detail == null) {
            return Stack(
              children: [
                shellActionRegistration,
                shellMiniNavRegistration,
                const Center(child: NovaLoadingIndicator()),
              ],
            );
          }

          if (state.status == TaskBoardDetailStatus.error && detail == null) {
            return Stack(
              children: [
                shellActionRegistration,
                shellMiniNavRegistration,
                _TaskBoardDetailErrorState(
                  message: context.l10n.taskBoardDetailLoadError,
                  onRetry: () => context.read<TaskBoardDetailCubit>().reload(),
                ),
              ],
            );
          }

          if (detail == null) {
            return Stack(
              children: [
                shellActionRegistration,
                shellMiniNavRegistration,
                _TaskBoardDetailErrorState(
                  message: context.l10n.taskBoardDetailLoadError,
                  onRetry: () => context.read<TaskBoardDetailCubit>().reload(),
                ),
              ],
            );
          }

          if (detail.lists.isEmpty) {
            return Stack(
              children: [
                shellActionRegistration,
                shellMiniNavRegistration,
                _NoListsState(
                  onCreateList: () => unawaited(_openCreateListDialog(context)),
                ),
              ],
            );
          }

          final sortedLists = _sortedListsByStatusOrder(detail.lists);
          final listViewLists = _listViewVisibleLists(
            sortedLists,
            state.filters,
          );
          final filteredByList = state.filteredTasksByListId;
          final bottomPadding =
              _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;
          final currentBoardKey = '${state.workspaceId}:${detail.id}';
          if (_initialListLoadBoardKey != currentBoardKey) {
            _initialListLoadBoardKey = currentBoardKey;
            _initialListLoadRequested.clear();
          }
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
          final activeTaskId = _selectedTaskId;
          final activeTask = activeTaskId == null
              ? null
              : _findTaskById(detail.tasks, activeTaskId);
          final isTaskDetailActive = activeTask != null && activeTaskId != null;
          if (activeTaskId != null && activeTask == null) {
            if (_normalizedInitialTaskId == null) {
              _selectedTaskId = null;
            } else if (_hasMoreTasksForLists(sortedLists, state) &&
                !state.isLoadingListTasks) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                _loadMoreVisibleLists(
                  context,
                  lists: sortedLists,
                  state: context.read<TaskBoardDetailCubit>().state,
                );
              });
            }

            if (_selectedTaskId != null) {
              return _TaskBoardDetailErrorState(
                message: state.isLoadingListTasks
                    ? context.l10n.notificationsLoadingMore
                    : context.l10n.taskBoardDetailLoadError,
                onRetry: () => context.read<TaskBoardDetailCubit>().reload(),
              );
            }
          }

          final boardSurface = Stack(
            children: [
              if (!isTaskDetailActive) ...[
                shellActionRegistration,
                shellMiniNavRegistration,
                shellTitleRegistration,
              ],
              ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final pageSizeHint = _tasksPageSizeHintForViewport(
                      constraints.maxHeight,
                    );
                    if (state.currentView == TaskBoardDetailView.list) {
                      for (final list in listViewLists) {
                        _requestInitialListLoadOnce(
                          list.id,
                          pageSizeHint,
                          state,
                        );
                      }
                    } else if (state.currentView ==
                        TaskBoardDetailView.timeline) {
                      for (final list in sortedLists) {
                        _requestInitialListLoadOnce(
                          list.id,
                          pageSizeHint,
                          state,
                        );
                      }
                    }

                    return RefreshIndicator(
                      onRefresh: () =>
                          context.read<TaskBoardDetailCubit>().reload(),
                      child: switch (state.currentView) {
                        TaskBoardDetailView.list => _TaskBoardEnhancedListView(
                          boardId: widget.boardId,
                          lists: listViewLists,
                          tasks: state.filteredTasksForListView,
                          state: state,
                          board: detail,
                          bottomPadding: bottomPadding,
                          scrollController: _listScrollController,
                          onTaskTap: (task) => _handleTaskTap(context, task),
                          onTaskMove: (task) => _openMoveTaskPicker(
                            context,
                            task,
                            sortedLists,
                          ),
                          onTaskMarkDone: (task) => _markTaskAsStatus(
                            context,
                            task,
                            sortedLists,
                            'done',
                          ),
                          onTaskMarkClosed: (task) => _markTaskAsStatus(
                            context,
                            task,
                            sortedLists,
                            'closed',
                          ),
                          isBulkSelectMode: state.isBulkSelectMode,
                          selectedTaskIds: state.selectedTaskIds,
                          onToggleTaskSelection: (task) => context
                              .read<TaskBoardDetailCubit>()
                              .toggleBulkTaskSelection(task.id),
                          collapsedListIds: _collapsedListIds,
                          onToggleListCollapsed: _toggleListCollapsed,
                          onLoadMore: () {
                            _loadMoreVisibleLists(
                              context,
                              lists: listViewLists,
                              state: state,
                              pageSizeHint: pageSizeHint,
                            );
                          },
                        ),
                        TaskBoardDetailView.kanban => _TaskBoardKanbanView(
                          boardId: widget.boardId,
                          lists: sortedLists,
                          tasksByList: filteredByList,
                          state: state,
                          board: detail,
                          bottomPadding: bottomPadding,
                          viewportHeight: constraints.maxHeight,
                          kanbanVerticalScrollController:
                              _kanbanVerticalScrollController,
                          kanbanHorizontalPageController:
                              _kanbanHorizontalPageController,
                          onRequestInitialLoad: _requestInitialListLoadOnce,
                          onRequestListWindowLoad: _requestListWindowLoad,
                          onLoadMore: (listId, pageSizeHint) => context
                              .read<TaskBoardDetailCubit>()
                              .loadListTasks(
                                listId: listId,
                                loadMore: true,
                                pageSizeHint: pageSizeHint,
                              ),
                          onRetryLoad: (listId, pageSizeHint) => context
                              .read<TaskBoardDetailCubit>()
                              .loadListTasks(
                                listId: listId,
                                forceRefresh: true,
                                pageSizeHint: pageSizeHint,
                              ),
                          onTaskTap: (task) => _handleTaskTap(context, task),
                          onTaskMove: (task) =>
                              _openMoveTaskPicker(context, task, sortedLists),
                          isBulkSelectMode: state.isBulkSelectMode,
                          selectedTaskIds: state.selectedTaskIds,
                          onToggleTaskSelection: (task) => context
                              .read<TaskBoardDetailCubit>()
                              .toggleBulkTaskSelection(task.id),
                          onCreateTask: (listId) => _openTaskCreateSheet(
                            context,
                            lists: sortedLists,
                            defaultListId: listId,
                          ),
                          onEditList: (list) =>
                              _openEditListDialog(context, list),
                        ),
                        TaskBoardDetailView.timeline => _TaskBoardTimelineView(
                          board: detail,
                          lists: sortedLists,
                          tasksByList: filteredByList,
                          bottomPadding: bottomPadding,
                          hasMoreTasks: _hasMoreTasksForLists(
                            sortedLists,
                            state,
                          ),
                          isLoadingMoreTasks: state.isLoadingListTasks,
                          verticalScrollController:
                              _timelineVerticalScrollController,
                          horizontalScrollController:
                              _timelineHorizontalScrollController,
                          onLoadMore: () {
                            _loadMoreVisibleLists(
                              context,
                              lists: sortedLists,
                              state: state,
                              pageSizeHint: pageSizeHint,
                            );
                          },
                          onTaskTap: (task) => _handleTaskTap(context, task),
                          onTimelineTaskCommit:
                              ({
                                required task,
                                required listId,
                                required startDate,
                                required endDate,
                              }) => _commitTimelineTaskChange(
                                context,
                                task: task,
                                listId: listId,
                                startDate: startDate,
                                endDate: endDate,
                              ),
                        ),
                      },
                    );
                  },
                ),
              ),
              if (state.isBulkSelectMode)
                SpeedDialFab(
                  label: context.l10n.taskBoardDetailBulkActions,
                  icon: Icons.checklist,
                  includeBottomSafeArea: false,
                  actions: [
                    FabAction(
                      icon: Icons.tune,
                      label: context.l10n.taskBoardDetailBulkActions,
                      onPressed: () =>
                          unawaited(_openBulkActionsSheet(context)),
                    ),
                    FabAction(
                      icon: Icons.select_all,
                      label: context.l10n.taskBoardDetailSelectAllFiltered,
                      onPressed: () => context
                          .read<TaskBoardDetailCubit>()
                          .selectAllFilteredTasks(),
                    ),
                    FabAction(
                      icon: Icons.close,
                      label: context.l10n.taskBoardDetailExitBulkSelect,
                      onPressed: () => context
                          .read<TaskBoardDetailCubit>()
                          .exitBulkSelectMode(),
                    ),
                  ],
                )
              else if (sortedLists.isNotEmpty)
                _TaskQuickCreateFab(
                  label: context.l10n.taskBoardDetailCreateTask,
                  onPressed: () => unawaited(
                    _openTaskCreateSheet(
                      context,
                      lists: sortedLists,
                      defaultListId: sortedLists.first.id,
                    ),
                  ),
                ),
            ],
          );

          return Stack(
            children: [
              boardSurface,
              if (isTaskDetailActive)
                Positioned.fill(
                  child: _TaskBoardTaskDetailFullscreenView(
                    key: ValueKey<String>('task-detail-$activeTaskId'),
                    task: activeTask,
                    board: detail,
                    lists: sortedLists,
                    labels: detail.labels,
                    members: detail.members,
                    projects: detail.projects,
                    isPersonalWorkspace: _isPersonalWorkspaceForBoard(
                      context,
                      detail,
                    ),
                    onClose: () => _closeTaskDetails(context),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  bool _hasMoreTasksForLists(
    List<TaskBoardList> lists,
    TaskBoardDetailState state,
  ) {
    return lists.any((list) => state.listHasMoreById[list.id] ?? true);
  }

  void _loadMoreVisibleLists(
    BuildContext context, {
    required List<TaskBoardList> lists,
    required TaskBoardDetailState state,
    int? pageSizeHint,
  }) {
    for (final list in lists) {
      final hasMore = state.listHasMoreById[list.id] ?? true;
      final isLoading = state.loadingListIds.contains(list.id);
      if (!hasMore || isLoading) continue;

      unawaited(
        context.read<TaskBoardDetailCubit>().loadListTasks(
          listId: list.id,
          loadMore: state.listTasksByListId.containsKey(list.id),
          pageSizeHint: pageSizeHint,
        ),
      );
    }
  }

  void _requestInitialListLoadOnce(
    String listId,
    int pageSizeHint,
    TaskBoardDetailState state,
  ) {
    final paginationStateReset =
        state.listTasksByListId.isEmpty &&
        state.loadedListIds.isEmpty &&
        state.listHasMoreById.isEmpty &&
        state.listOffsetsById.isEmpty &&
        state.listPageSizeById.isEmpty &&
        state.listLoadErrorById.isEmpty;
    if (paginationStateReset && _initialListLoadRequested.isNotEmpty) {
      _initialListLoadRequested.clear();
      _initialListLoadBoardKey = null;
    }

    if (state.loadingListIds.contains(listId) ||
        state.listTasksByListId.containsKey(listId) ||
        state.loadedListIds.contains(listId) ||
        state.listLoadErrorById.containsKey(listId) ||
        _initialListLoadRequested.contains(listId)) {
      return;
    }
    _initialListLoadRequested.add(listId);
    unawaited(
      context.read<TaskBoardDetailCubit>().loadListTasks(
        listId: listId,
        pageSizeHint: pageSizeHint,
      ),
    );
  }

  void _requestListWindowLoad(
    int focusedIndex,
    int pageSizeHint,
    TaskBoardDetailState state,
  ) {
    final board = state.board;
    if (board == null || board.lists.isEmpty) return;
    final sortedLists = _sortedListsByStatusOrder(board.lists);
    final start = focusedIndex.clamp(0, sortedLists.length - 1);
    final endExclusive = math.min(start + 3, sortedLists.length);
    for (var index = start; index < endExclusive; index++) {
      _requestInitialListLoadOnce(sortedLists[index].id, pageSizeHint, state);
    }
  }

  String? get _normalizedInitialTaskId {
    return _normalizedTaskId(widget.initialTaskId);
  }

  String? _normalizedTaskId(String? value) {
    final taskId = value?.trim();
    return taskId == null || taskId.isEmpty ? null : taskId;
  }

  TaskBoardTask? _findTaskById(List<TaskBoardTask> tasks, String taskId) {
    for (final task in tasks) {
      if (task.id == taskId) return task;
    }
    return null;
  }

  void _toggleListCollapsed(String listId) {
    setState(() {
      if (!_collapsedListIds.add(listId)) {
        _collapsedListIds.remove(listId);
      }
    });
  }

  void _setBoardView(BuildContext context, TaskBoardDetailView view) {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (cubit.state.currentView == view) {
      _restoreScrollOffsetsForCurrentBoard();
      return;
    }

    _rememberScrollOffsets();
    cubit.setView(view);
    _restoreScrollOffsetsForCurrentBoard();
  }

  Future<void> _openTaskDetails(
    BuildContext context,
    TaskBoardTask task,
  ) {
    final board = context.read<TaskBoardDetailCubit>().state.board;
    if (board == null) return Future<void>.value();
    final router = GoRouter.of(context);
    final location = Routes.taskBoardTaskDetailPath(board.id, task.id);
    final shouldSyncRoute = _isTaskBoardRouteContext(context);
    _rememberScrollOffsets();
    setState(() => _selectedTaskId = task.id);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !shouldSyncRoute || _selectedTaskId != task.id) return;
      router.go(location);
    });
    return Future<void>.value();
  }

  void _closeTaskDetails(BuildContext context) {
    final router = GoRouter.of(context);
    final location = Routes.taskBoardDetailPath(widget.boardId);
    final shouldSyncRoute = _isTaskBoardRouteContext(context);
    _rememberScrollOffsets();
    if (_selectedTaskId != null) {
      setState(() => _selectedTaskId = null);
    }
    _restoreScrollOffsetsForCurrentBoard();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !shouldSyncRoute || _selectedTaskId != null) return;
      router.go(location);
    });
  }

  bool _isTaskBoardRouteContext(BuildContext context) {
    try {
      final router = GoRouter.of(context);
      final currentPath = router.routeInformationProvider.value.uri.path;
      if (currentPath == Routes.taskBoardDetailPath(widget.boardId)) {
        return true;
      }
      return GoRouterState.of(context).matchedLocation ==
          Routes.taskBoardDetail;
    } on Exception {
      return false;
    }
  }

  String _scrollOffsetKey(String surface) => '${widget.boardId}:$surface';

  double _savedOffset(String surface) {
    return _savedScrollOffsets[_scrollOffsetKey(surface)] ?? 0;
  }

  void _rememberScrollOffsets() {
    _rememberScrollOffset('list', _listScrollController);
    _rememberScrollOffset('kanban-vertical', _kanbanVerticalScrollController);
    _rememberScrollOffset(
      'timeline-vertical',
      _timelineVerticalScrollController,
    );
    _rememberScrollOffset(
      'timeline-horizontal',
      _timelineHorizontalScrollController,
    );
    if (_kanbanHorizontalPageController.hasClients) {
      final page = _kanbanHorizontalPageController.page;
      if (page != null) {
        _savedKanbanPages[widget.boardId] = page.round();
      }
    }
  }

  void _rememberScrollOffset(String surface, ScrollController controller) {
    if (!controller.hasClients) return;
    _savedScrollOffsets[_scrollOffsetKey(surface)] = controller.offset;
  }

  void _restoreScrollOffsetsForCurrentBoard() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _jumpToSavedOffset('list', _listScrollController);
      _jumpToSavedOffset('kanban-vertical', _kanbanVerticalScrollController);
      _jumpToSavedOffset(
        'timeline-vertical',
        _timelineVerticalScrollController,
      );
      _jumpToSavedOffset(
        'timeline-horizontal',
        _timelineHorizontalScrollController,
      );
      final page = _savedKanbanPages[widget.boardId];
      if (page != null && _kanbanHorizontalPageController.hasClients) {
        _kanbanHorizontalPageController.jumpToPage(page);
      }
    });
  }

  void _jumpToSavedOffset(String surface, ScrollController controller) {
    if (!controller.hasClients) return;
    final savedOffset = _savedOffset(surface);
    final position = controller.position;
    final clampedOffset = savedOffset.clamp(
      position.minScrollExtent,
      position.maxScrollExtent,
    );
    controller.jumpTo(clampedOffset);
  }

  Future<void> _handleTaskTap(
    BuildContext context,
    TaskBoardTask task,
  ) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (cubit.state.isBulkSelectMode) {
      cubit.toggleBulkTaskSelection(task.id);
      return;
    }
    await _openTaskDetails(context, task);
  }

  Future<void> _openBulkActionsSheet(BuildContext context) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (!cubit.state.isBulkSelectMode) {
      cubit.enterBulkSelectMode();
    }

    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) => BlocProvider.value(
        value: cubit,
        child: _TaskBoardBulkActionsDrawer(
          onClose: () => unawaited(dismissAdaptiveDrawerOverlay(drawerContext)),
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
        isPersonalWorkspace: _isPersonalWorkspaceForBoard(context, board),
      ),
    );

    await showAdaptiveDrawer(context: context, builder: (_) => content);
  }

  Future<void> _openSearchSheet(BuildContext context) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (_searchController.text != cubit.state.searchQuery) {
      _searchController.value = TextEditingValue(
        text: cubit.state.searchQuery,
        selection: TextSelection.collapsed(
          offset: cubit.state.searchQuery.length,
        ),
      );
    }

    await showAdaptiveDrawer(
      context: context,
      builder: (drawerContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.taskBoardDetailSearchTitle,
                      style: shad.Theme.of(context).typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(12),
                    shad.TextField(
                      contextMenuBuilder: platformTextContextMenuBuilder(),
                      controller: _searchController,
                      hintText: context.l10n.taskBoardDetailSearchPlaceholder,
                      onChanged: (value) {
                        cubit.setSearchQuery(value);
                        setModalState(() {});
                      },
                    ),
                    const shad.Gap(12),
                    Row(
                      children: [
                        if (_searchController.text.trim().isNotEmpty)
                          shad.OutlineButton(
                            onPressed: () {
                              _searchController.clear();
                              cubit.setSearchQuery('');
                              setModalState(() {});
                            },
                            child: Text(context.l10n.commonClearSearch),
                          ),
                        const Spacer(),
                        shad.PrimaryButton(
                          onPressed: () => Navigator.of(drawerContext).pop(),
                          child: Text(context.l10n.taskBoardDetailSearchDone),
                        ),
                      ],
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

  Future<void> _commitTimelineTaskChange(
    BuildContext context, {
    required TaskBoardTask task,
    required String listId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;

    try {
      await cubit.updateTask(
        taskId: task.id,
        listId: task.listId,
        name: task.name?.trim().isNotEmpty == true
            ? task.name!.trim()
            : context.l10n.taskBoardDetailUntitledTask,
        description: task.description,
        priority: task.priority,
        startDate: _taskStartOfDay(startDate),
        endDate: _taskEndOfDay(endDate),
        estimationPoints: task.estimationPoints,
        labelIds: task.labelIds,
        projectIds: task.projectIds,
        assigneeIds: task.assigneeIds,
      );
      if (!context.mounted) {
        return;
      }
      if (listId != task.listId) {
        await cubit.moveTask(taskId: task.id, listId: listId);
      }
    } on ApiException catch (error) {
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isNotEmpty
                ? error.message
                : fallbackErrorMessage,
          ),
        ),
      );
    } on Exception {
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    }
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

  Future<void> _markTaskAsStatus(
    BuildContext context,
    TaskBoardTask task,
    List<TaskBoardList> lists,
    String status,
  ) async {
    final normalizedStatus = TaskBoardList.normalizeSupportedStatus(status);
    if (normalizedStatus == null) {
      return;
    }

    final targetLists = lists
        .where(
          (list) =>
              list.id != task.listId &&
              TaskBoardList.normalizeSupportedStatus(list.status) ==
                  normalizedStatus,
        )
        .toList(growable: false);

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (targetLists.isEmpty) {
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardDetailNoListsInStatus),
        ),
      );
      return;
    }

    String? selectedListId;
    if (targetLists.length == 1) {
      selectedListId = targetLists.single.id;
    } else {
      final title = normalizedStatus == 'done'
          ? context.l10n.taskBoardDetailBulkMarkDone
          : context.l10n.taskBoardDetailBulkMarkClosed;
      selectedListId = await shad.showDialog<String>(
        context: context,
        builder: (dialogContext) => _TaskListPickerDialog(
          title: title,
          lists: targetLists,
        ),
      );
    }

    if (selectedListId == null || !context.mounted) return;

    final cubit = context.read<TaskBoardDetailCubit>();
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    final movedMessage = context.l10n.taskBoardDetailMovedToStatus(
      _taskBoardListStatusLabel(context, normalizedStatus),
    );

    try {
      await cubit.moveTask(taskId: task.id, listId: selectedListId);
      if (!context.mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(content: Text(movedMessage)),
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
