part of 'task_board_detail_page.dart';

class _TaskBoardDetailPageView extends StatefulWidget {
  const _TaskBoardDetailPageView({required this.boardId});

  final String boardId;

  @override
  State<_TaskBoardDetailPageView> createState() =>
      _TaskBoardDetailPageViewState();
}

class _TaskBoardDetailPageViewState extends State<_TaskBoardDetailPageView> {
  late final TextEditingController _searchController;

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
            final bottomPadding = 24 + MediaQuery.paddingOf(context).bottom;
            if (_searchController.text != state.searchQuery) {
              _searchController.value = TextEditingValue(
                text: state.searchQuery,
                selection: TextSelection.collapsed(
                  offset: state.searchQuery.length,
                ),
              );
            }

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        shad.Tabs(
                          index: state.currentView == TaskBoardDetailView.list
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
                              child: Text(context.l10n.taskBoardDetailListView),
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
          onTaskTap: (task) => _openTaskPreview(context, task),
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
                      onTaskTap: (task) => _openTaskPreview(context, task),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
      ],
    );
  }

  void _openTaskPreview(
    BuildContext context,
    TaskBoardTask task,
  ) {
    final title = task.name?.trim().isNotEmpty == true
        ? task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final description = _taskDescriptionPreview(task.description);
    final priorityLabel = _taskPriorityLabel(context, task.priority);
    final datesLabel = _taskDatesLabel(task);

    showAdaptiveDrawer(
      context: context,
      builder: (context) {
        final maxHeight = MediaQuery.sizeOf(context).height * 0.7;

        return SafeArea(
          top: false,
          child: SizedBox(
            width: double.infinity,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: shad.Theme.of(context).typography.large.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (description case final descriptionText?) ...[
                        const shad.Gap(8),
                        Text(
                          descriptionText,
                          style: shad.Theme.of(context).typography.textMuted,
                        ),
                      ],
                      const shad.Gap(12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          shad.OutlineBadge(child: Text(priorityLabel)),
                          if (datesLabel.isNotEmpty)
                            shad.OutlineBadge(child: Text(datesLabel)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
