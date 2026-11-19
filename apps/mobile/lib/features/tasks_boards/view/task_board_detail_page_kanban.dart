part of 'task_board_detail_page.dart';

const _kanbanPhoneColumnFraction = .86;

bool _usesPagedKanban(double bodyWidth) =>
    Breakpoints.fromWidth(bodyWidth) == DeviceClass.compact;

class _TaskBoardKanbanView extends StatefulWidget {
  const _TaskBoardKanbanView({
    required this.boardId,
    required this.lists,
    required this.tasksByList,
    required this.state,
    required this.viewportHeight,
    required this.now,
    required this.kanbanVerticalScrollController,
    required this.kanbanHorizontalPageController,
    required this.onRequestInitialLoad,
    required this.onRequestListWindowLoad,
    required this.onLoadMore,
    required this.onRetryLoad,
    required this.onTaskTap,
    required this.onTaskMenu,
    required this.onTaskDrop,
    required this.onCreateTask,
    required this.onEditList,
    required this.onFocusedListChanged,
    super.key,
  });

  final String boardId;
  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final TaskBoardDetailState state;
  final double viewportHeight;
  final DateTime now;
  final ScrollController kanbanVerticalScrollController;
  final PageController kanbanHorizontalPageController;
  final void Function(
    String listId,
    int pageSizeHint,
    TaskBoardDetailState state,
  )
  onRequestInitialLoad;
  final void Function(int index, int pageSizeHint, TaskBoardDetailState state)
  onRequestListWindowLoad;
  final Future<void> Function(String listId, int pageSizeHint) onLoadMore;
  final Future<void> Function(String listId, int pageSizeHint) onRetryLoad;
  final Future<void> Function(TaskBoardTask task) onTaskTap;
  final Future<void> Function(TaskBoardTask task) onTaskMenu;
  final void Function(TaskBoardTask task, String listId, String? beforeTaskId)
  onTaskDrop;
  final Future<void> Function(String? listId) onCreateTask;
  final Future<void> Function(TaskBoardList list) onEditList;
  final ValueChanged<int> onFocusedListChanged;

  @override
  State<_TaskBoardKanbanView> createState() => _TaskBoardKanbanViewState();
}

class _TaskBoardKanbanViewState extends State<_TaskBoardKanbanView> {
  final _wideController = ScrollController();
  final _edge = _KanbanEdgeScroll();
  final GlobalKey _canvasKey = GlobalKey();
  final _columns = <String, GlobalKey<_KanbanColumnState>>{};
  _KanbanColumnState? _hovered;
  DragTargetDetails<TaskBoardTask>? _drag;
  int? _wideIndex;

  @override
  void didUpdateWidget(covariant _TaskBoardKanbanView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.lists != widget.lists) {
      final ids = widget.lists.map((list) => list.id).toSet();
      _columns.removeWhere((id, _) => !ids.contains(id));
    }
  }

  @override
  void dispose() {
    _edge.stop();
    _wideController.dispose();
    super.dispose();
  }

  _KanbanColumnState? _columnAt(Offset pointer) {
    final canvas = _canvasKey.currentContext?.findRenderObject();
    if (canvas is! RenderBox || !canvas.attached) return null;
    final local = canvas.globalToLocal(pointer);
    if (local.dy < 0 ||
        local.dy >=
            canvas.size.height -
                AppPageInsets.contentBottomClearance(context)) {
      return null;
    }
    for (final key in _columns.values) {
      final column = key.currentState;
      final box = column?.context.findRenderObject();
      if (box is RenderBox &&
          box.attached &&
          box.hasSize &&
          (Offset.zero & box.size).contains(box.globalToLocal(pointer))) {
        return column;
      }
    }
    return null;
  }

  void _updateHover() {
    final drag = _drag;
    if (!mounted || drag == null) return;
    final column = _columnAt(drag.offset);
    final next = column?._acceptsDrop == true ? column : null;
    if (_hovered != next) {
      if (_hovered?.mounted == true) _hovered!._clearHover();
      _hovered = next;
      if (next != null) unawaited(AppHaptics.selection());
    }
    next?._hover(drag);
  }

  void _finishDrag(PageController? pageController) {
    _edge.stop();
    if (_drag == null) return;
    _drag = null;
    if (_hovered?.mounted == true) _hovered!._clearHover();
    _hovered = null;
    if (!mounted || pageController == null || !pageController.hasClients) {
      return;
    }
    final page = pageController.page?.round();
    if (page == null || page == pageController.page) return;
    final next = page.clamp(0, widget.lists.length - 1);
    if (MediaQuery.disableAnimationsOf(context)) {
      pageController.jumpToPage(next);
    } else {
      unawaited(
        pageController.animateToPage(
          next,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final filtered =
        state.searchQuery.trim().isNotEmpty || state.filters.hasAdvancedFilters;
    if (filtered && widget.tasksByList.isEmpty) {
      return AppPageListView(
        key: PageStorageKey('kanban-empty-${widget.boardId}'),
        controller: widget.kanbanVerticalScrollController,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (state.isLoadingListTasks)
            const AppSkeletonRows(count: 3)
          else if (state.listLoadErrorById.isNotEmpty)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: context.l10n.commonSomethingWentWrong,
              actionLabel: context.l10n.commonRetry,
              onAction: context
                  .read<TaskBoardDetailCubit>()
                  .ensureAllListsLoaded,
            )
          else
            AppStateMessage.inline(
              icon: LucideIcons.filter,
              title: context.l10n.taskBoardDetailNoMatchingTasks,
            ),
        ],
      );
    }
    final pageSize = _tasksPageSizeHintForViewport(widget.viewportHeight);
    final contentBottom =
        AppPageInsets.contentBottomClearance(context) + AppLayout.scrollEndGap;
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final paged = _usesPagedKanban(width);
        final columns = math.max(2, (width / 340).floor());
        final columnWidth = paged
            ? width * _kanbanPhoneColumnFraction
            : (width - AppSpacing.lg) / columns;
        final controller = paged
            ? widget.kanbanHorizontalPageController
            : _wideController;
        final axisSign = Directionality.of(context) == TextDirection.rtl
            ? -1
            : 1;

        Widget column(BuildContext context, int index) {
          final list = widget.lists[index];
          final tasks =
              (widget.tasksByList[list.id] ?? const <TaskBoardTask>[]).toList()
                ..sort(compareKanbanTasks);
          final failed = state.listLoadErrorById.containsKey(list.id);
          widget.onRequestInitialLoad(list.id, pageSize, state);
          return Padding(
            padding: EdgeInsetsDirectional.only(
              start: paged ? AppSpacing.md : 0,
              end: paged ? 0 : AppSpacing.sm,
              top: AppSpacing.sm,
            ),
            child: _KanbanColumn(
              key: _columns.putIfAbsent(
                list.id,
                GlobalKey<_KanbanColumnState>.new,
              ),
              workspaceId: state.workspaceId!,
              list: list,
              now: widget.now,
              tasks: tasks,
              bottomClearance: contentBottom,
              isLoading:
                  state.loadingListIds.contains(list.id) ||
                  !state.loadedListIds.contains(list.id) && !failed,
              hasLoadError: failed,
              hasMoreTasks: state.listHasMoreById[list.id] ?? true,
              filtered: filtered,
              bulkSelect: state.isBulkSelectMode,
              selectedTaskIds: state.selectedTaskIds,
              canDrag: !filtered && !state.isMutating,
              onLoadMore: () => unawaited(
                failed
                    ? widget.onRetryLoad(list.id, pageSize)
                    : widget.onLoadMore(list.id, pageSize),
              ),
              onTap: (task) => unawaited(widget.onTaskTap(task)),
              onMenu: (task) => unawaited(widget.onTaskMenu(task)),
              onCreateTask: () => unawaited(widget.onCreateTask(list.id)),
              onEditList: () => unawaited(widget.onEditList(list)),
            ),
          );
        }

        Widget buildScroller() {
          if (paged) {
            return PageView.builder(
              key: PageStorageKey(
                'task-board-kanban-horizontal-${widget.boardId}',
              ),
              controller: widget.kanbanHorizontalPageController,
              padEnds: false,
              itemCount: widget.lists.length,
              onPageChanged: (index) {
                widget.onFocusedListChanged(index);
                widget.onRequestListWindowLoad(index, pageSize, state);
              },
              itemBuilder: (_, index) => column(context, index),
            );
          }
          return NotificationListener<ScrollUpdateNotification>(
            onNotification: (event) {
              if (event.metrics.axis != Axis.horizontal || event.depth != 0) {
                return false;
              }
              final index = (event.metrics.pixels / columnWidth).floor().clamp(
                0,
                widget.lists.length - 1,
              );
              if (index != _wideIndex) {
                _wideIndex = index;
                widget.onFocusedListChanged(index);
                widget.onRequestListWindowLoad(index, pageSize, state);
              }
              return false;
            },
            child: ListView.builder(
              key: PageStorageKey('task-board-wide-kanban-${widget.boardId}'),
              controller: _wideController,
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              itemExtent: columnWidth,
              itemCount: widget.lists.length,
              itemBuilder: (_, index) => column(context, index),
            ),
          );
        }

        final page = paged ? widget.kanbanHorizontalPageController : null;
        return DragTarget<TaskBoardTask>(
          onWillAcceptWithDetails: (_) =>
              !filtered && !state.isMutating && !state.isBulkSelectMode,
          onMove: (details) {
            _drag = details;
            final box = _canvasKey.currentContext?.findRenderObject();
            if (box is! RenderBox || !box.attached) return;
            final x = box.globalToLocal(details.offset).dx;
            _edge.update(
              controller,
              axisSign > 0 ? x : width - x,
              width,
              onScroll: () => WidgetsBinding.instance.addPostFrameCallback(
                (_) => _updateHover(),
              ),
            );
            _updateHover();
          },
          onLeave: (_) => _finishDrag(page),
          onAcceptWithDetails: (details) {
            final column = _columnAt(details.offset);
            final destination = column?._acceptsDrop == true ? column : null;
            final listId = destination?.widget.list.id;
            final before = destination?._insertionPoint(
              details.data.id,
              details.offset,
            );
            _finishDrag(page);
            if (listId != null) widget.onTaskDrop(details.data, listId, before);
          },
          builder: (_, _, _) =>
              SizedBox.expand(key: _canvasKey, child: buildScroller()),
        );
      },
    );
  }
}
