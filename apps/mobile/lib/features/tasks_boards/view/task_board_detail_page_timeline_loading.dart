part of 'task_board_detail_page.dart';

/// The Timeline places tasks by date, so it needs every task of every open
/// list, not the first page the other views start from.
const int _timelinePageSize = 100;

/// Tasks per list the Timeline loads on its own; beyond this it offers
/// Load more instead of paging a huge list unattended.
const int _timelineAutoLoadTaskBudget = 2000;

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

  /// After this frame, requests the next page of every open list that has
  /// more and is under the budget. The resulting state change rebuilds the
  /// page and schedules the following page, until every list is loaded.
  void _scheduleTimelinePages(
    BuildContext context,
    List<TaskBoardList> openLists,
  ) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !context.mounted) return;
      final cubit = context.read<TaskBoardDetailCubit>();
      final state = cubit.state;
      if (state.currentView != TaskBoardDetailView.timeline) return;
      for (final list in openLists) {
        if (state.loadingListIds.contains(list.id) ||
            state.listLoadErrorById.containsKey(list.id) ||
            !(state.listHasMoreById[list.id] ?? true) ||
            (state.listTasksByListId[list.id]?.length ?? 0) >=
                _timelineAutoLoadTaskBudget) {
          continue;
        }
        unawaited(
          cubit.loadListTasks(
            listId: list.id,
            loadMore: state.listTasksByListId.containsKey(list.id),
            pageSizeHint: _timelinePageSize,
          ),
        );
      }
    });
  }
}
