part of 'task_board_detail_cubit.dart';

/// Applies an arriving list page without re-processing the rest of the
/// board: only the page's descriptions are parsed and only its list is
/// rebuilt, so loading every page of a board stays linear.
extension _TaskBoardPageMerge on TaskBoardDetailCubit {
  /// [merged] with the board's snapshots (optimistic edits) for the page's
  /// tasks. Other tasks of the list were merged when their page arrived.
  List<TaskBoardTask> _withBoardSnapshots(
    TaskBoardDetail board,
    List<TaskBoardTask> merged,
    Set<String> pageIds,
  ) {
    final snapshots = <String, TaskBoardTask>{
      for (final task in board.tasks)
        if (pageIds.contains(task.id)) task.id: task,
    };
    if (snapshots.isEmpty) return List.unmodifiable(merged);
    return List.unmodifiable([
      for (final task in merged) snapshots[task.id] ?? task,
    ]);
  }

  /// The page size for [listId]. A larger [pageSizeHint] grows the page size
  /// of later pages (the Timeline asks for 100 after the List view loaded
  /// 15); offsets count tasks, so the change is safe.
  int _pageSizeFor(String listId, bool loadMore, int? pageSizeHint) {
    final storedPageSize = state.listPageSizeById[listId];
    final hintedPageSize = TaskBoardDetailCubit._normalizePageSize(
      pageSizeHint,
    );
    if (storedPageSize == null) return hintedPageSize;
    return loadMore && pageSizeHint != null && hintedPageSize > storedPageSize
        ? hintedPageSize
        : storedPageSize;
  }

  /// The description search index with [replaced] tasks dropped and only
  /// [pageTasks] parsed; every other entry is reused as is.
  Map<String, String> _searchIndexWithPage({
    required Iterable<TaskBoardTask> replaced,
    required Iterable<TaskBoardTask> pageTasks,
  }) {
    final index = Map<String, String>.of(state.taskDescriptionSearchIndex);
    for (final task in replaced) {
      index.remove(task.id);
    }
    index.addAll(_buildTaskDescriptionSearchIndex(pageTasks));
    return Map.unmodifiable(index);
  }
}
