part of 'task_board_detail_page.dart';

/// The Timeline places tasks by date, so it needs every task of every open
/// list, not the first page the other views start from. The paging policy
/// (page size, board budget, concurrency) is [taskTimelineListsToLoad].
/// Done and Closed lists contribute only their first page, which is enough
/// to show recently finished work faded on the bars.
extension _TimelineLoading on _TaskBoardDetailPageViewState {
  /// Lists the Timeline shows: Done and Closed lists are left out.
  List<TaskBoardList> _timelineOpenLists(List<TaskBoardList> lists) => [
    for (final list in lists)
      if (!_taskListDone(list)) list,
  ];

  bool _timelineHasLoadError(
    List<TaskBoardList> lists,
    TaskBoardDetailState state,
  ) => _timelineOpenLists(
    lists,
  ).any((list) => state.listLoadErrorById.containsKey(list.id));

  /// Whether an open list still has pages that can be loaded.
  bool _timelineHasMore(
    List<TaskBoardList> openLists,
    TaskBoardDetailState state,
  ) => _timelineOpenLists(
    openLists,
  ).any((list) => state.listHasMoreById[list.id] ?? true);

  /// After this frame, requests the next pages the policy allows. Each page
  /// changes the state, which rebuilds the page and schedules the next ones,
  /// until every open list is loaded or the board budget is reached.
  void _scheduleTimelinePages(BuildContext context, List<TaskBoardList> lists) {
    final openLists = _timelineOpenLists(lists);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !context.mounted) return;
      final cubit = context.read<TaskBoardDetailCubit>();
      final state = cubit.state;
      if (state.currentView != TaskBoardDetailView.timeline) return;
      final ids = [for (final list in openLists) list.id];
      for (final listId in taskTimelineListsToLoad(
        openListIds: ids,
        loadingListIds: state.loadingListIds,
        erroredListIds: state.listLoadErrorById.keys.toSet(),
        hasMoreById: state.listHasMoreById,
        loadedCountById: {
          for (final id in ids) id: state.listTasksByListId[id]?.length ?? 0,
        },
      )) {
        unawaited(
          cubit.loadListTasks(
            listId: listId,
            loadMore: state.listTasksByListId.containsKey(listId),
            pageSizeHint: taskTimelinePageSize,
          ),
        );
      }
      for (final list in lists) {
        if (!_taskListDone(list) ||
            state.listTasksByListId.containsKey(list.id) ||
            state.loadingListIds.contains(list.id) ||
            state.listLoadErrorById.containsKey(list.id)) {
          continue;
        }
        unawaited(
          cubit.loadListTasks(
            listId: list.id,
            pageSizeHint: taskTimelinePageSize,
          ),
        );
      }
    });
  }

  /// Opens the list view filtered to tasks without dates.
  void _showUndated(bool personal) {
    final cubit = context.read<TaskBoardDetailCubit>();
    cubit.setFilters(cubit.state.filters.copyWith(undatedOnly: true));
    if (personal) {
      _openBoardViewRoute(context, TaskBoardDetailView.list);
    } else {
      _setBoardView(context, TaskBoardDetailView.list);
    }
  }

  Future<void> _shiftTaskTimeline(
    BuildContext context, {
    required TaskBoardTask task,
    required int deltaDays,
  }) async {
    final cubit = context.read<TaskBoardDetailCubit>();
    if (deltaDays == 0 || cubit.state.isMutating) return;
    final zone = taskTimezone(context);
    final l10n = context.l10n;

    DateTime shiftedDay(DateTime date) {
      final day = taskDay(date, zone);
      return DateTime(day.year, day.month, day.day + deltaDays);
    }

    final start = task.startDate;
    final end = task.endDate;
    try {
      await cubit.updateTask(
        taskId: task.id,
        name: task.name?.trim().isNotEmpty == true
            ? task.name!.trim()
            : l10n.taskBoardDetailUntitledTask,
        startDate: start == null
            ? null
            : taskStartOfDayIn(shiftedDay(start), zone),
        endDate: end == null ? null : taskEndOfDayIn(shiftedDay(end), zone),
      );
    } on TaskBoardMutationInProgressException {
      return;
    } on Exception {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: l10n.taskTimelineRescheduleFailed,
        variant: AppAlertVariant.destructive,
      );
    }
  }
}
