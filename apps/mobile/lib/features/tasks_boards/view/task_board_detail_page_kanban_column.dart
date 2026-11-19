part of 'task_board_detail_page.dart';

class _KanbanColumn extends StatefulWidget {
  const _KanbanColumn({
    required this.workspaceId,
    required this.list,
    required this.tasks,
    required this.now,
    required this.bottomClearance,
    required this.isLoading,
    required this.hasLoadError,
    required this.hasMoreTasks,
    required this.filtered,
    required this.bulkSelect,
    required this.selectedTaskIds,
    required this.canDrag,
    required this.onLoadMore,
    required this.onTap,
    required this.onMenu,
    required this.onCreateTask,
    required this.onEditList,
    super.key,
  });

  final String workspaceId;
  final TaskBoardList list;
  final List<TaskBoardTask> tasks;
  final DateTime now;
  final double bottomClearance;
  final bool isLoading;
  final bool hasLoadError;
  final bool hasMoreTasks;
  final bool filtered;
  final bool bulkSelect;
  final Set<String> selectedTaskIds;
  final bool canDrag;
  final VoidCallback onLoadMore;
  final ValueChanged<TaskBoardTask> onTap;
  final ValueChanged<TaskBoardTask> onMenu;
  final VoidCallback onCreateTask;
  final VoidCallback onEditList;

  @override
  State<_KanbanColumn> createState() => _KanbanColumnState();
}

class _KanbanColumnState extends State<_KanbanColumn> {
  final _scroll = ScrollController();
  final GlobalKey _viewport = GlobalKey();
  final _rowKeys = <String, GlobalKey>{};
  final _edge = _KanbanEdgeScroll();
  Offset? _pointer;
  String? _draggedTaskId;
  String? _beforeTaskId;
  bool _expandEmpty = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_updateInsertion);
  }

  @override
  void didUpdateWidget(covariant _KanbanColumn oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tasks != widget.tasks) {
      final ids = widget.tasks.map((task) => task.id).toSet();
      _rowKeys.removeWhere((id, _) => !ids.contains(id));
    }
  }

  @override
  void dispose() {
    _edge.stop();
    _scroll.dispose();
    super.dispose();
  }

  bool get _acceptsDrop =>
      !widget.hasLoadError && (!widget.isLoading || widget.tasks.isNotEmpty);

  void _hover(DragTargetDetails<TaskBoardTask> details) {
    if (_draggedTaskId == null) {
      setState(() => _draggedTaskId = details.data.id);
    }
    _pointer = details.offset;
    final box = _viewport.currentContext?.findRenderObject();
    if (box is RenderBox && box.attached && box.hasSize) {
      final y = box.globalToLocal(details.offset).dy;
      _edge.update(_scroll, y, box.size.height);
    }
    _updateInsertion();
  }

  String? _insertionPoint(String taskId, Offset pointer) {
    final viewport = _viewport.currentContext?.findRenderObject();
    if (viewport is! RenderBox || !viewport.hasSize || !viewport.attached) {
      return widget.tasks.where((item) => item.id != taskId).firstOrNull?.id;
    }
    final top = viewport.localToGlobal(Offset.zero).dy;
    final bottom = top + viewport.size.height;
    final pointerY = pointer.dy.clamp(top, bottom);
    String? nextId;
    // Keep the first visible midpoint after the pointer. The lazy list has
    // no layout for cards beyond its cache extent.
    for (final item in widget.tasks.reversed) {
      if (item.id == taskId) continue;
      final box = _rowKeys[item.id]?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.hasSize || !box.attached) {
        nextId = item.id;
        continue;
      }
      final middle = box.localToGlobal(Offset(0, box.size.height / 2)).dy;
      if (middle < pointerY) break;
      nextId = item.id;
    }
    return nextId;
  }

  void _updateInsertion() {
    final pointer = _pointer;
    final taskId = _draggedTaskId;
    if (pointer == null || taskId == null) return;
    final before = _insertionPoint(taskId, pointer);
    if (before == _beforeTaskId) return;
    setState(() => _beforeTaskId = before);
    unawaited(AppHaptics.selection());
  }

  void _clearHover() {
    _edge.stop();
    _pointer = null;
    if (_draggedTaskId == null) return;
    setState(() {
      _draggedTaskId = null;
      _beforeTaskId = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final style = _taskBoardListVisualStyle(context, widget.list);
    final empty =
        widget.tasks.isEmpty && !widget.isLoading && !widget.hasLoadError;
    final count = widget.filtered || !widget.hasMoreTasks
        ? widget.tasks.length
        : math.max(widget.list.taskCount ?? 0, widget.tasks.length);
    final hovering = _draggedTaskId != null;
    final collapsed = empty && !_expandEmpty && !hovering;
    return Align(
      alignment: AlignmentDirectional.topStart,
      child: DecoratedBox(
        key: ValueKey('kanban-column-${widget.list.id}'),
        decoration: BoxDecoration(
          color: Color.alphaBlend(
            style.accent.withValues(alpha: .05),
            tokens.colorScheme.muted,
          ),
          borderRadius: BorderRadius.circular(tokens.shapes.panel),
          border: Border.all(
            color: hovering ? tokens.colorScheme.primary : style.surfaceBorder,
          ),
        ),
        child: Column(
          mainAxisSize: collapsed ? MainAxisSize.min : MainAxisSize.max,
          children: [
            _KanbanColumnHeader(
              list: widget.list,
              count: count,
              collapsed: empty ? collapsed : null,
              onToggle: empty
                  ? () => setState(() => _expandEmpty = !_expandEmpty)
                  : null,
              onCreate: widget.onCreateTask,
              onEdit: widget.onEditList,
            ),
            if (!collapsed)
              Expanded(child: _buildCards(context, hovering: hovering)),
          ],
        ),
      ),
    );
  }

  Widget _buildCards(BuildContext context, {required bool hovering}) {
    final l10n = context.l10n;
    final tasks = widget.tasks;
    final footer =
        widget.isLoading ||
        widget.hasLoadError ||
        widget.hasMoreTasks ||
        tasks.isEmpty ||
        hovering;
    return NotificationListener<ScrollNotification>(
      onNotification: (event) {
        if (event is ScrollUpdateNotification &&
            event.depth == 0 &&
            widget.hasMoreTasks &&
            !widget.isLoading &&
            !widget.hasLoadError &&
            event.metrics.extentAfter < 220) {
          widget.onLoadMore();
        }
        return false;
      },
      child: ListView.builder(
        key: _viewport,
        controller: _scroll,
        primary: false,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          AppSpacing.sm,
          AppSpacing.xs,
          AppSpacing.sm,
          widget.bottomClearance,
        ),
        itemCount: tasks.length + (footer ? 1 : 0),
        findChildIndexCallback: (key) {
          final id = _rowKeys.entries
              .where((entry) => entry.value == key)
              .firstOrNull
              ?.key;
          final index = tasks.indexWhere((task) => task.id == id);
          return index < 0 ? null : index;
        },
        itemBuilder: (context, index) {
          if (index == tasks.length) {
            if (hovering && _beforeTaskId == null) {
              return const _KanbanInsertionLine();
            }
            if (widget.isLoading) {
              return AppSkeletonRows(count: tasks.isEmpty ? 3 : 1);
            }
            if (widget.hasLoadError ||
                widget.hasMoreTasks && tasks.isNotEmpty) {
              return AppButton.outline(
                onPressed: widget.onLoadMore,
                child: Text(
                  widget.hasLoadError
                      ? l10n.commonRetry
                      : l10n.timerHistoryLoadMore,
                ),
              );
            }
            if (tasks.isEmpty) {
              return AppStateMessage.inline(
                icon: LucideIcons.inbox,
                title: l10n.taskBoardDetailNoTasksInList,
              );
            }
            return const SizedBox.shrink();
          }
          final task = tasks[index];
          return Column(
            key: _rowKeys.putIfAbsent(task.id, GlobalKey.new),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (hovering && _beforeTaskId == task.id)
                const _KanbanInsertionLine(),
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: _KanbanDraggableCard(
                  task: task,
                  now: widget.now,
                  list: widget.list,
                  workspaceId: widget.workspaceId,
                  selected: widget.selectedTaskIds.contains(task.id),
                  bulkSelect: widget.bulkSelect,
                  canDrag: widget.canDrag && !widget.bulkSelect,
                  onTap: () => widget.onTap(task),
                  onMenu: () => widget.onMenu(task),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
