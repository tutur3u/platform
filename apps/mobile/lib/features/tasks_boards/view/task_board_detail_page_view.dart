part of 'task_board_detail_page.dart';

class _TaskBoardDetailPageView extends StatefulWidget {
  const _TaskBoardDetailPageView({required this.boardId});

  final String boardId;

  @override
  State<_TaskBoardDetailPageView> createState() =>
      _TaskBoardDetailPageViewState();
}

class _TaskBoardDetailPageViewState extends State<_TaskBoardDetailPageView> {
  static const double _fabContentBottomPadding = 96;
  late final TextEditingController _searchController;
  final Set<String> _collapsedListIds = <String>{};

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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
            shad.IconButton.ghost(
              icon: const Icon(Icons.refresh),
              onPressed: () => unawaited(
                context.read<TaskBoardDetailCubit>().reload(),
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
              return const _NoListsState();
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
                                  bottomPadding,
                                )
                              : _buildKanbanView(
                                  context,
                                  sortedLists,
                                  filteredByList,
                                  state,
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
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildListView(
    BuildContext context,
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByList,
    TaskBoardDetailState state,
    double bottomPadding,
  ) {
    if (state.filteredTasks.isEmpty && state.searchQuery.trim().isNotEmpty) {
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
        );
      },
    );
  }

  Widget _buildKanbanView(
    BuildContext context,
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByList,
    TaskBoardDetailState state,
    double bottomPadding,
  ) {
    if (state.filteredTasks.isEmpty && state.searchQuery.trim().isNotEmpty) {
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
    final content = BlocProvider.value(
      value: parentContext.read<TaskBoardDetailCubit>(),
      child: _TaskBoardTaskDetailSheet(
        task: task,
        lists: lists,
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
    final normalizedDefaultListId =
        defaultListId != null && lists.any((list) => list.id == defaultListId)
        ? defaultListId
        : lists.first.id;

    final content = BlocProvider.value(
      value: parentContext.read<TaskBoardDetailCubit>(),
      child: _TaskBoardTaskEditorSheet(
        task: null,
        lists: lists,
        defaultListId: normalizedDefaultListId,
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
