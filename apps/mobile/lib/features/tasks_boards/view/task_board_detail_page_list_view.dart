part of 'task_board_detail_page.dart';

class _TaskBoardEnhancedListView extends StatefulWidget {
  const _TaskBoardEnhancedListView({
    required this.boardId,
    required this.lists,
    required this.tasks,
    required this.state,
    required this.board,
    required this.bottomPadding,
    required this.scrollController,
    required this.onTaskTap,
    required this.onTaskMove,
    required this.onLoadMore,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final List<TaskBoardTask> tasks;
  final TaskBoardDetailState state;
  final TaskBoardDetail board;
  final double bottomPadding;
  final ScrollController scrollController;
  final void Function(TaskBoardTask task) onTaskTap;
  final void Function(TaskBoardTask task) onTaskMove;
  final VoidCallback onLoadMore;

  @override
  State<_TaskBoardEnhancedListView> createState() =>
      _TaskBoardEnhancedListViewState();
}

class _TaskBoardEnhancedListViewState
    extends State<_TaskBoardEnhancedListView> {
  TaskBoardListViewSortField _sort = (field: 'created_at', ascending: false);

  List<TaskBoardTask> get _sortedTasks {
    return sortTaskBoardListViewTasks(widget.tasks, _sort);
  }

  void _showSortBottomSheet() {
    unawaited(
      showAdaptiveSheet<void>(
        context: context,
        backgroundColor: shad.Theme.of(context).colorScheme.background,
        builder: (context) => _SortBottomSheet(
          currentField: _sort.field,
          ascending: _sort.ascending,
          onSortSelected: (field, {required ascending}) {
            setState(() {
              _sort = (field: field, ascending: ascending);
            });
            Navigator.pop(context);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final sortedTasks = _sortedTasks;

    if (sortedTasks.isEmpty) {
      return ListView(
        key: PageStorageKey<String>(
          'task-board-enhanced-list-empty-${widget.boardId}',
        ),
        controller: widget.scrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
        children: [
          shad.Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.inbox_outlined,
                    size: 48,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(16),
                  Text(
                    context.l10n.taskBoardDetailNoTasksInList,
                    style: theme.typography.large,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      key: PageStorageKey<String>('task-board-enhanced-list-${widget.boardId}'),
      controller: widget.scrollController,
      primary: false,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 0, 16, widget.bottomPadding),
      itemCount: sortedTasks.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return _buildSortChip();
        }

        final taskIndex = index - 1;

        if (taskIndex >= sortedTasks.length) {
          if (widget.state.filteredTasks.length > sortedTasks.length) {
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Center(
                child: shad.OutlineButton(
                  onPressed: widget.onLoadMore,
                  child: Text(context.l10n.timerHistoryLoadMore),
                ),
              ),
            );
          }
          return const SizedBox.shrink();
        }

        final task = sortedTasks[taskIndex];
        final isLast = taskIndex == sortedTasks.length - 1;

        return _TaskCard(
          task: task,
          board: widget.board,
          lists: widget.lists,
          isLast: isLast,
          onTap: () => widget.onTaskTap(task),
          onMove: () => widget.onTaskMove(task),
        );
      },
    );
  }

  Widget _buildSortChip() {
    final theme = shad.Theme.of(context);
    final sortLabel = taskBoardListViewSortFieldLabel(context, _sort.field);
    final isAscending = _sort.ascending;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: _showSortBottomSheet,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.sort,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
              const shad.Gap(6),
              Text(
                'Sort: $sortLabel',
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w500,
                  color: theme.colorScheme.foreground,
                ),
              ),
              const shad.Gap(4),
              Icon(
                isAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 14,
                color: theme.colorScheme.primary,
              ),
              const Spacer(),
              Icon(
                Icons.expand_more,
                size: 16,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
