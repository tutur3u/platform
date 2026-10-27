part of 'task_board_detail_page.dart';

/// The Timeline places tasks by date, so it needs every task of every open
/// list, not the first page the other views start from. The paging policy
/// (page size, board budget, concurrency) is [taskTimelineListsToLoad].
extension _TimelineLoading on _TaskBoardDetailPageViewState {
  /// Lists the Timeline shows: Done and Closed lists are left out.
  List<TaskBoardList> _timelineOpenLists(List<TaskBoardList> lists) => [
    for (final list in lists)
      if (!_taskListDone(list)) list,
  ];

  /// Whether an open list still has pages that can be loaded.
  bool _timelineHasMore(
    List<TaskBoardList> openLists,
    TaskBoardDetailState state,
  ) => openLists.any(
    (list) =>
        !state.listLoadErrorById.containsKey(list.id) &&
        (state.listHasMoreById[list.id] ?? true),
  );

  /// After this frame, requests the next pages the policy allows. Each page
  /// changes the state, which rebuilds the page and schedules the next ones,
  /// until every open list is loaded or the board budget is reached.
  void _scheduleTimelinePages(
    BuildContext context,
    List<TaskBoardList> openLists,
  ) {
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
    });
  }
}
