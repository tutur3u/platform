part of 'task_board_detail_page.dart';

/// The board timeline as a vertical, day-grouped agenda anchored on today.
///
/// One [CustomScrollView] centred on today's group: overdue days grow upward
/// above it and upcoming days downward, each built lazily row by row. The
/// agenda is rebuilt only when the tasks, the day, the zone or the range
/// change, and re-anchors on the new day at midnight in the user's zone.
/// [hasMoreTasks] means open lists still have unloaded pages; the agenda
/// then never claims a day is empty.
class _TaskBoardTimelineView extends StatefulWidget {
  const _TaskBoardTimelineView({
    required this.lists,
    required this.tasksByList,
    required this.hasMoreTasks,
    required this.isLoadingMoreTasks,
    required this.scrollController,
    required this.onLoadMore,
    required this.onTaskTap,
  });

  final List<TaskBoardList> lists;
  final Map<String, List<TaskBoardTask>> tasksByList;
  final bool hasMoreTasks;
  final bool isLoadingMoreTasks;
  final ScrollController scrollController;
  final VoidCallback onLoadMore;
  final Future<void> Function(TaskBoardTask task) onTaskTap;

  @override
  State<_TaskBoardTimelineView> createState() => _TaskBoardTimelineViewState();
}

class _TaskBoardTimelineViewState extends State<_TaskBoardTimelineView> {
  static const ValueKey<String> _todayKey = ValueKey('task-timeline-today');

  final TaskTimelineAgendaCache _cache = TaskTimelineAgendaCache();
  TaskTimelineRange _range = TaskTimelineRange.month;
  TaskTimelineAgenda? _itemsAgenda;
  _TimelineItems _items = const _TimelineItems.empty();
  Timer? _midnight;

  @override
  void dispose() {
    _midnight?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final zone = taskTimezone(context);
    final now = DateTime.now();
    _midnight ??= Timer(
      taskTimeUntilNextDay(now, zone) + const Duration(seconds: 1),
      () {
        _midnight = null;
        if (mounted) setState(() {});
      },
    );
    final openLists = [
      for (final list in widget.lists)
        if (!_taskListDone(list)) list,
    ];
    final agenda = _cache.resolve(
      listIds: [for (final list in openLists) list.id],
      tasksByList: widget.tasksByList,
      now: now,
      range: _range,
      zone: zone,
    );
    if (!identical(agenda, _itemsAgenda)) {
      _itemsAgenda = agenda;
      _items = _TimelineItems.from(agenda);
    }
    final listNames = {
      for (final list in openLists)
        list.id: list.name?.trim().isNotEmpty == true
            ? list.name!.trim()
            : context.l10n.taskBoardDetailUntitledList,
    };

    return LayoutBuilder(
      builder: (context, constraints) {
        final gutter = AppPageInsets.gutterOf(
          context,
          width: constraints.maxWidth,
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                gutter,
                AppLayout.pageTop,
                gutter,
                AppSpacing.sm,
              ),
              child: _TimelineToolbar(
                range: _range,
                onRangeChanged: (range) => setState(() => _range = range),
                onToday: agenda.hasScheduled ? _scrollToToday : null,
              ),
            ),
            Expanded(
              child: agenda.hasScheduled || agenda.unscheduled.isNotEmpty
                  ? _scrollView(context, listNames)
                  : widget.isLoadingMoreTasks
                  ? const AppLoadingIndicator.page()
                  : AppStateMessage(
                      icon: LucideIcons.calendarRange,
                      title: context.l10n.taskBoardDetailTimelineEmptyTitle,
                      message:
                          context.l10n.taskBoardDetailTimelineEmptyDescription,
                      actionLabel: widget.hasMoreTasks
                          ? context.l10n.timerHistoryLoadMore
                          : null,
                      onAction: widget.hasMoreTasks ? widget.onLoadMore : null,
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _scrollView(BuildContext context, Map<String, String> listNames) {
    Widget item(_TimelineItem item) => _TimelineItemView(
      item: item,
      listNames: listNames,
      allLoaded: !widget.hasMoreTasks,
      loading: widget.isLoadingMoreTasks,
      onTaskTap: (task) => unawaited(widget.onTaskTap(task)),
      onShowLater: () => setState(() => _range = TaskTimelineRange.all),
      onShowOverdue: _scrollToOverdue,
      onLoadMore: widget.onLoadMore,
    );
    SliverList list(List<_TimelineItem> items, {Key? key}) =>
        SliverList.builder(
          key: key,
          itemCount: items.length,
          itemBuilder: (context, index) => item(items[index]),
        );

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        final metrics = notification.metrics;
        if (notification.depth == 0 &&
            widget.hasMoreTasks &&
            !widget.isLoadingMoreTasks &&
            metrics.pixels >= metrics.maxScrollExtent - 600) {
          widget.onLoadMore();
        }
        return false;
      },
      child: CustomScrollView(
        controller: widget.scrollController,
        center: _todayKey,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // Before the centre, slivers grow upward: index 0 sits just above
          // today, so the overdue items are stored bottom-up.
          SliverAppPage(
            includeTop: false,
            includeBottom: false,
            sliver: list(_items.pastBottomUp),
          ),
          SliverAppPage(
            key: _todayKey,
            includeTop: false,
            includeBottom: false,
            sliver: list(_items.today),
          ),
          SliverAppPage(
            includeTop: false,
            sliver: SliverMainAxisGroup(
              slivers: [
                list(_items.after),
                if (widget.isLoadingMoreTasks)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.only(top: AppSpacing.lg),
                      child: Center(child: AppLoadingIndicator()),
                    ),
                  )
                else if (widget.hasMoreTasks)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.lg),
                      child: Center(
                        child: AppButton.outline(
                          key: const ValueKey('task-timeline-load-more'),
                          onPressed: widget.onLoadMore,
                          child: Text(context.l10n.timerHistoryLoadMore),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _scrollToToday() => _scrollTo((position) => 0);

  /// Overdue days sit above today, so their top is the minimum extent.
  void _scrollToOverdue() => _scrollTo((position) => position.minScrollExtent);

  void _scrollTo(double Function(ScrollPosition position) target) {
    final controller = widget.scrollController;
    if (!controller.hasClients) return;
    final offset = target(controller.position);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion) {
      controller.jumpTo(offset);
      return;
    }
    unawaited(
      controller.animateTo(
        offset,
        duration: AppMotion.slow,
        curve: AppMotion.standard,
      ),
    );
  }
}
