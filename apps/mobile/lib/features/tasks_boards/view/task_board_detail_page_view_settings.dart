part of 'task_board_detail_page.dart';

/// Per-board display settings, mirroring the web board toolbar: whether the
/// list view shows completed/closed work, whether empty lists are hidden,
/// compact task cards, and the list-view sort.
///
/// Persisted per board on the device, like the web's `board_config_<id>`
/// local storage entry.
class _TaskBoardViewSettings extends Equatable {
  const _TaskBoardViewSettings({
    this.showCompleted = false,
    this.hideEmptyLists = true,
    this.compactCards = false,
    this.sort = _defaultTaskBoardListSort,
  });

  factory _TaskBoardViewSettings.fromJson(Map<String, dynamic> json) {
    final sortField = json['sortField'];
    return _TaskBoardViewSettings(
      showCompleted: json['showCompleted'] == true,
      hideEmptyLists: json['hideEmptyLists'] != false,
      compactCards: json['compactCards'] == true,
      sort: sortField is String && sortField.isNotEmpty
          ? (field: sortField, ascending: json['sortAscending'] == true)
          : _defaultTaskBoardListSort,
    );
  }

  final bool showCompleted;
  final bool hideEmptyLists;
  final bool compactCards;
  final TaskBoardListViewSortField sort;

  _TaskBoardViewSettings copyWith({
    bool? showCompleted,
    bool? hideEmptyLists,
    bool? compactCards,
    TaskBoardListViewSortField? sort,
  }) => _TaskBoardViewSettings(
    showCompleted: showCompleted ?? this.showCompleted,
    hideEmptyLists: hideEmptyLists ?? this.hideEmptyLists,
    compactCards: compactCards ?? this.compactCards,
    sort: sort ?? this.sort,
  );

  Map<String, dynamic> toJson() => {
    'showCompleted': showCompleted,
    'hideEmptyLists': hideEmptyLists,
    'compactCards': compactCards,
    'sortField': sort.field,
    'sortAscending': sort.ascending,
  };

  @override
  List<Object?> get props => [
    showCompleted,
    hideEmptyLists,
    compactCards,
    sort.field,
    sort.ascending,
  ];
}

const TaskBoardListViewSortField _defaultTaskBoardListSort = (
  field: 'priority',
  ascending: false,
);

String _taskBoardViewSettingsKey(String boardId) =>
    'task_board_view_settings_v1_$boardId';

Future<_TaskBoardViewSettings> _loadTaskBoardViewSettings(
  String boardId,
) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_taskBoardViewSettingsKey(boardId));
    if (raw == null || raw.isEmpty) return const _TaskBoardViewSettings();
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      return const _TaskBoardViewSettings();
    }
    return _TaskBoardViewSettings.fromJson(decoded);
  } on Object {
    return const _TaskBoardViewSettings();
  }
}

Future<void> _saveTaskBoardViewSettings(
  String boardId,
  _TaskBoardViewSettings settings,
) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _taskBoardViewSettingsKey(boardId),
      jsonEncode(settings.toJson()),
    );
  } on Object {
    // Display preferences are best effort; the in-memory value still applies.
  }
}

/// Whether a task counts as finished work (completed or closed).
bool _taskIsFinished(TaskBoardTask task) =>
    task.completed == true || task.completedAt != null || task.closedAt != null;

/// Lists shown by the list view. By default the list view shows active work
/// only: done/closed lists are hidden unless the viewer shows completed work
/// or explicitly filters by list or status.
List<TaskBoardList> _listViewListsUnder(
  List<TaskBoardList> lists,
  TaskBoardDetailFilters filters,
  _TaskBoardViewSettings settings,
) {
  final visible = _listViewVisibleLists(lists, filters);
  final explicitListFilter =
      filters.listIds.isNotEmpty || filters.statuses.isNotEmpty;
  if (settings.showCompleted || explicitListFilter) return visible;
  return visible
      .where((list) => !_taskBoardListIsTerminalInListView(list))
      .toList(growable: false);
}

/// Tasks shown by the list view under [settings].
List<TaskBoardTask> _listViewTasksUnder(
  List<TaskBoardTask> tasks,
  List<TaskBoardList> allLists,
  List<TaskBoardList> visibleLists,
  TaskBoardDetailFilters filters,
  _TaskBoardViewSettings settings,
) {
  // An explicit list or status filter reveals terminal lists, and every task
  // in a done or closed list carries completed_at/closed_at, so it shows
  // finished work too.
  if (settings.showCompleted ||
      filters.listIds.isNotEmpty ||
      filters.statuses.isNotEmpty) {
    return tasks;
  }
  // The list view groups by date, not by list, so tasks in hidden (done or
  // closed) lists are dropped here; tasks in lists the board does not know
  // about stay visible.
  final known = {for (final list in allLists) list.id};
  final visible = {for (final list in visibleLists) list.id};
  return tasks
      .where(
        (task) =>
            !_taskIsFinished(task) &&
            (visible.contains(task.listId) || !known.contains(task.listId)),
      )
      .toList(growable: false);
}

/// Whether [list] is known to have no visible tasks: the server count is zero,
/// or every page has loaded and nothing passed the current filters.
/// Whether [list] is known to have no visible tasks. Only the server task
/// count decides, so columns do not disappear mid-session while pages load or
/// tasks move, which would shift the Kanban page onto another list.
bool _taskBoardListIsKnownEmpty(
  TaskBoardList list,
  TaskBoardDetailState state,
  List<TaskBoardTask> visibleTasks,
) => visibleTasks.isEmpty && list.taskCount == 0;

/// Kanban columns under [settings]: empty lists are hidden by default.
List<TaskBoardList> _kanbanListsUnder(
  List<TaskBoardList> sortedLists,
  TaskBoardDetailState state,
  _TaskBoardViewSettings settings,
) {
  if (!settings.hideEmptyLists) return sortedLists;
  final tasksByList = state.filteredTasksByListId;
  final visible = sortedLists
      .where(
        (list) => !_taskBoardListIsKnownEmpty(
          list,
          state,
          tasksByList[list.id] ?? const <TaskBoardTask>[],
        ),
      )
      .toList(growable: false);
  // Never hide every column: the board needs somewhere to create tasks.
  return visible.isEmpty ? sortedLists : visible;
}

extension _TaskBoardViewSettingsState on _TaskBoardDetailPageViewState {
  List<TaskBoardList> _listViewListsForSettings(
    List<TaskBoardList> lists,
    TaskBoardDetailFilters filters,
  ) => _listViewListsUnder(lists, filters, _viewSettings);

  List<TaskBoardTask> _listViewTasksForSettings(
    List<TaskBoardTask> tasks,
    List<TaskBoardList> allLists,
    List<TaskBoardList> visibleLists,
  ) => _listViewTasksUnder(
    tasks,
    allLists,
    visibleLists,
    context.read<TaskBoardDetailCubit>().state.filters,
    _viewSettings,
  );

  List<TaskBoardList> _kanbanListsForSettings(
    List<TaskBoardList> sortedLists,
    TaskBoardDetailState state,
  ) => _kanbanListsUnder(sortedLists, state, _viewSettings);
}

/// Display settings section shown at the top of the filter sheet.
class _TaskBoardViewSettingsSection extends StatelessWidget {
  const _TaskBoardViewSettingsSection({
    required this.settings,
    required this.onChanged,
  });

  final _TaskBoardViewSettings settings;
  final ValueChanged<_TaskBoardViewSettings> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.taskBoardViewSettingsTitle,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(4),
        AppToggleRow(
          key: const ValueKey('task-board-setting-show-completed'),
          title: Text(l10n.taskBoardViewSettingsShowCompleted),
          subtitle: Text(l10n.taskBoardViewSettingsShowCompletedDescription),
          value: settings.showCompleted,
          onChanged: (value) =>
              onChanged(settings.copyWith(showCompleted: value)),
        ),
        AppToggleRow(
          key: const ValueKey('task-board-setting-hide-empty'),
          title: Text(l10n.taskBoardViewSettingsHideEmptyLists),
          subtitle: Text(l10n.taskBoardViewSettingsHideEmptyListsDescription),
          value: settings.hideEmptyLists,
          onChanged: (value) =>
              onChanged(settings.copyWith(hideEmptyLists: value)),
        ),
        AppToggleRow(
          key: const ValueKey('task-board-setting-compact'),
          title: Text(l10n.taskBoardViewSettingsCompactCards),
          subtitle: Text(l10n.taskBoardViewSettingsCompactCardsDescription),
          value: settings.compactCards,
          onChanged: (value) =>
              onChanged(settings.copyWith(compactCards: value)),
        ),
      ],
    );
  }
}

/// Summary of what currently narrows the list view, with a one-tap reset.
class _ActiveFiltersBar extends StatelessWidget {
  const _ActiveFiltersBar({
    required this.filters,
    required this.settings,
    required this.onOpenFilters,
    required this.onClearFilters,
  });

  final TaskBoardDetailFilters filters;
  final _TaskBoardViewSettings settings;
  final VoidCallback onOpenFilters;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String counted(String label, Set<String> ids) => '$label (${ids.length})';
    final labels = <String>[
      if (!settings.showCompleted) l10n.taskBoardActiveFiltersActiveOnly,
      if (filters.listIds.isNotEmpty)
        counted(l10n.taskBoardDetailFilterLists, filters.listIds),
      if (filters.statuses.isNotEmpty)
        counted(l10n.taskBoardDetailFilterStatuses, filters.statuses),
      if (filters.priorities.isNotEmpty)
        counted(l10n.taskBoardDetailPriority, filters.priorities),
      if (filters.assigneeIds.isNotEmpty)
        counted(l10n.taskBoardDetailFilterAssignees, filters.assigneeIds),
      if (filters.labelIds.isNotEmpty)
        counted(l10n.taskBoardDetailFilterLabels, filters.labelIds),
      if (filters.projectIds.isNotEmpty)
        counted(l10n.taskBoardDetailFilterProjects, filters.projectIds),
    ];
    if (labels.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Wrap(
        key: const ValueKey('task-board-active-filters'),
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (final label in labels)
            AppChip(label: Text(label), onPressed: onOpenFilters),
          if (filters.hasAdvancedFilters)
            AppButton.ghost(
              onPressed: onClearFilters,
              child: Text(l10n.taskBoardDetailClearFilters),
            ),
        ],
      ),
    );
  }
}

/// Footer for the paged list view: requests the next page as soon as it is
/// laid out near the viewport, so reaching the bottom loads more without a
/// button. A button remains only to retry after a failed page.
class _TaskListAutoLoadFooter extends StatefulWidget {
  const _TaskListAutoLoadFooter({
    required this.isLoading,
    required this.hasError,
    required this.progress,
    required this.onLoadMore,
  });

  final bool isLoading;

  /// Grows whenever a page lands, including pages served from cache, which
  /// never toggle [isLoading].
  final int progress;
  final bool hasError;
  final VoidCallback onLoadMore;

  @override
  State<_TaskListAutoLoadFooter> createState() =>
      _TaskListAutoLoadFooterState();
}

class _TaskListAutoLoadFooterState extends State<_TaskListAutoLoadFooter> {
  bool _scheduled = false;

  @override
  void initState() {
    super.initState();
    _scheduleLoad();
  }

  @override
  void didUpdateWidget(covariant _TaskListAutoLoadFooter oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A finished page that still leaves the footer on screen asks for the
    // next one; a failed page waits for an explicit retry.
    if ((oldWidget.isLoading && !widget.isLoading) ||
        oldWidget.progress != widget.progress) {
      _scheduleLoad();
    }
  }

  void _scheduleLoad() {
    if (_scheduled || widget.isLoading || widget.hasError) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!mounted || widget.isLoading || widget.hasError) return;
      widget.onLoadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const ValueKey('task-list-auto-load-footer'),
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: widget.hasError && !widget.isLoading
            ? AppButton.outline(
                onPressed: widget.onLoadMore,
                child: Text(context.l10n.commonRetry),
              )
            : const AppLoadingIndicator(),
      ),
    );
  }
}
