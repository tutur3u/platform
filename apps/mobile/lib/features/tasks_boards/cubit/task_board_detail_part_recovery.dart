part of 'task_board_detail_cubit.dart';

/// Reads a board's unavailable parts again after it loads without them.
///
/// The board stays on screen with the parts it has; each attempt merges the
/// parts that loaded into the current state and caches the result. A newer
/// board load or closing the cubit stops the attempts.
mixin _TaskBoardPartRecovery on Cubit<TaskBoardDetailState> {
  static const List<Duration> defaultPartRetryDelays = [
    Duration(seconds: 2),
    Duration(seconds: 6),
    Duration(seconds: 18),
  ];

  /// Waits before each attempt; the attempts stop when this runs out.
  List<Duration> get partRetryDelays;

  TaskRepository get _taskRepository;
  int get _loadRequestToken;
  Timer? _partRetryTimer;

  /// Keeps the parts [detail] could not load from the board already shown,
  /// so a refresh that loses a part does not blank it.
  TaskBoardDetail _withShownParts(TaskBoardDetail detail) {
    final shown = state.board;
    if (shown == null ||
        shown.id != detail.id ||
        detail.unavailableParts.isEmpty) {
      return detail;
    }
    return _copyParts(detail, from: shown, parts: detail.unavailableParts);
  }

  void _scheduleBoardPartRetry(int requestToken, {int attempt = 0}) {
    _partRetryTimer?.cancel();
    _partRetryTimer = null;
    final board = state.board;
    if (board == null ||
        board.unavailableParts.isEmpty ||
        attempt >= partRetryDelays.length) {
      return;
    }
    _partRetryTimer = Timer(
      partRetryDelays[attempt],
      () => unawaited(_retryBoardParts(requestToken, attempt)),
    );
  }

  Future<void> _retryBoardParts(int requestToken, int attempt) async {
    final board = state.board;
    if (isClosed || requestToken != _loadRequestToken || board == null) {
      return;
    }
    final TaskBoardDetail reloaded;
    try {
      reloaded = await _taskRepository.reloadTaskBoardDetailParts(board);
    } on Object {
      _scheduleBoardPartRetry(requestToken, attempt: attempt + 1);
      return;
    }
    final current = state.board;
    if (isClosed ||
        requestToken != _loadRequestToken ||
        current == null ||
        current.id != reloaded.id) {
      return;
    }
    final recovered = board.unavailableParts.difference(
      reloaded.unavailableParts,
    );
    if (recovered.isNotEmpty) {
      _applyRecoveredParts(current, reloaded, recovered);
    }
    _scheduleBoardPartRetry(requestToken, attempt: attempt + 1);
  }

  void _applyRecoveredParts(
    TaskBoardDetail current,
    TaskBoardDetail reloaded,
    Set<TaskBoardDetailPart> recovered,
  ) {
    final merged = _copyParts(current, from: reloaded, parts: recovered)
        .copyWith(
          unavailableParts: current.unavailableParts.difference(recovered),
        );
    List<TaskBoardTask> hydrate(List<TaskBoardTask> tasks) =>
        hydrateBoardTaskRelations(
          tasks: tasks,
          members: merged.members,
          labels: merged.labels,
          projects: merged.projects,
        );
    final listTasks = {
      for (final entry in state.listTasksByListId.entries)
        entry.key: List<TaskBoardTask>.unmodifiable(hydrate(entry.value)),
    };
    final board = merged.copyWith(tasks: hydrate(merged.tasks));
    emit(state.copyWith(board: board, listTasksByListId: listTasks));
    unawaited(
      CacheStore.instance
          .write(
            key: _detailCacheKey(wsId: board.wsId, boardId: board.id),
            policy: TaskBoardDetailCubit._detailCachePolicy,
            payload: board.copyWith(tasks: const []).toJson(),
            tags: [
              TaskBoardDetailCubit._detailCacheTag,
              'workspace:${board.wsId}',
              'module:tasks',
            ],
          )
          .catchError((_) {}),
    );
  }

  @override
  Future<void> close() {
    _partRetryTimer?.cancel();
    _partRetryTimer = null;
    return super.close();
  }
}

TaskBoardDetail _copyParts(
  TaskBoardDetail target, {
  required TaskBoardDetail from,
  required Set<TaskBoardDetailPart> parts,
}) {
  var next = target;
  for (final part in parts) {
    next = switch (part) {
      TaskBoardDetailPart.labels => next.copyWith(labels: from.labels),
      TaskBoardDetailPart.members => next.copyWith(members: from.members),
      TaskBoardDetailPart.projects => next.copyWith(projects: from.projects),
      TaskBoardDetailPart.estimation => next.copyWith(
        estimationType: from.estimationType,
        extendedEstimation: from.extendedEstimation,
        allowZeroEstimates: from.allowZeroEstimates,
        countUnestimatedIssues: from.countUnestimatedIssues,
      ),
    };
  }
  return next;
}
