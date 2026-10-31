part of 'dashboard_page.dart';

extension _DashboardCustomization on _DashboardViewState {
  /// Build-time only: module visibility and the mode gate use `select`.
  List<String> _availableHomeWidgetIds(BuildContext context) {
    final modules = AppRegistry.modules(context);
    final user = context.read<AuthCubit>().state.user;
    final mode = context.select<AudienceModeCubit?, AudienceMode>(
      (cubit) => cubit?.state.mode ?? AudienceMode.general,
    );
    // Offered only once access is confirmed, so a member without
    // view_user_groups never sees a placeholder for it.
    final classesAccess = context
        .select<ClassesTodayCubit?, ClassesTodayAccess?>(
          (cubit) => cubit?.state.access,
        );
    return [
      for (final id in mode.profile.homeWidgets)
        if (id != classesTodayHomeWidgetId ||
            classesAccess == ClassesTodayAccess.granted)
          id,
      'tasks',
      'calendar',
      if (modules.any((module) => module.id == 'mail') &&
          canDiscoverMail(user?.email, appMetadata: user?.appMetadata))
        'mail',
      if (modules.any((module) => module.id == 'meet')) 'meet',
      if (modules.any((module) => module.id == 'finance')) 'finance',
      if (modules.any((module) => module.id == 'notes')) 'notes',
      'summary',
    ];
  }

  List<Widget> _dashboardWidgets(
    BuildContext context,
    Workspace workspace,
    TaskListState taskState,
    CalendarState calendarState,
    ({List<UserTask> today, List<UserTask> upNext}) tasks,
    List<CalendarEvent> upcomingEvents,
  ) {
    final user = context.read<AuthCubit>().state.user;
    final available = _availableHomeWidgetIds(context);
    _availableIds = available;
    final layout = context.watch<DashboardLayoutCubit>().state;
    final cards = <String, Widget>{
      classesTodayHomeWidgetId: StaggeredEntrance(
        replayKey: widget.replayToken,
        child: const ClassesTodayCard(),
      ),
      'tasks': StaggeredEntrance(
        replayKey: widget.replayToken,
        child: _TaskSectionsBlock(
          state: taskState,
          today: tasks.today,
          upNext: tasks.upNext,
        ),
      ),
      'calendar': StaggeredEntrance(
        replayKey: widget.replayToken,
        child: _UpcomingEventsBlock(
          status: calendarState.status,
          hasLoadedOnce: calendarState.hasLoadedOnce,
          events: upcomingEvents,
        ),
      ),
      'mail': _DashboardMailCard(
        key: _mailCardKey,
        workspaceId: workspace.id,
        userId: user?.id,
      ),
      'meet': _DashboardMeetCard(
        key: _meetCardKey,
        workspaceId: workspace.id,
        userId: user?.id,
      ),
      'finance': _DashboardFinanceCard(
        key: _financeCardKey,
        workspaceId: workspace.id,
        userId: user?.id,
      ),
      'notes': _DashboardNotesCard(
        key: _notesCardKey,
        workspaceId: workspace.id,
        userId: user?.id,
      ),
      'summary': StaggeredEntrance(
        replayKey: widget.replayToken,
        child: _TodaySummaryCard(
          activeTasks: taskState.totalActiveTasks,
          overdueTasks: taskState.overdueTasks.length,
          nextEvents: upcomingEvents.length,
        ),
      ),
    };
    return [
      for (final id in layout.arranged(available))
        if (!layout.hidden.contains(id))
          KeyedSubtree(key: ValueKey('home-widget-$id'), child: cards[id]!),
    ];
  }

  void _showHomeCustomization(BuildContext context) {
    final layoutCubit = context.read<DashboardLayoutCubit>();
    // The sheet opens from a tap, outside build: reuse the built list.
    final available = _availableIds;
    unawaited(
      showOrderEditorSheet(
        context,
        title: context.l10n.homeCustomize,
        builder: (context) => BlocProvider.value(
          value: layoutCubit,
          child: _HomeWidgetEditor(available: available),
        ),
      ),
    );
  }
}

class _HomeWidgetEditor extends StatelessWidget {
  const _HomeWidgetEditor({required this.available});

  final List<String> available;

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<DashboardLayoutCubit>();
    final modules = cubit.state.arranged(available);
    final shownCount = modules
        .where((id) => !cubit.state.hidden.contains(id))
        .length;
    return ReorderableListView.builder(
      buildDefaultDragHandles: false,
      itemCount: modules.length,
      onReorderItem: (oldIndex, newIndex) {
        if (oldIndex >= shownCount) return;
        final moved = modules.removeAt(oldIndex);
        modules.insert(newIndex.clamp(0, shownCount - 1), moved);
        unawaited(cubit.setOrder(modules));
      },
      itemBuilder: (context, index) {
        final id = modules[index];
        final hidden = cubit.state.hidden.contains(id);
        final (label, icon) = _homeWidgetPresentation(context, id);
        return Column(
          key: ValueKey('home-editor-$id'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hidden && index == shownCount) ...[
              const Divider(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  context.l10n.homeHiddenWidgets,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
              ),
            ],
            ListTile(
              leading: Icon(icon),
              title: Text(label),
              textColor: hidden
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : null,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: hidden
                        ? context.l10n.homeShowWidget
                        : context.l10n.homeHideWidget,
                    onPressed: () =>
                        unawaited(cubit.setHidden(id, hidden: !hidden)),
                    icon: Icon(
                      hidden
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                  if (!hidden)
                    ReorderableDragStartListener(
                      index: index,
                      child: Tooltip(
                        message: context.l10n.appsReorder,
                        child: const SizedBox.square(
                          dimension: 48,
                          child: Icon(Icons.drag_handle_rounded),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

(String, IconData) _homeWidgetPresentation(BuildContext context, String id) {
  final module = AppRegistry.moduleById(id);
  if (module != null && id != 'tasks' && id != 'calendar') {
    return (module.label(context.l10n), module.icon);
  }
  return switch (id) {
    classesTodayHomeWidgetId => (
      context.l10n.classesTodayTitle,
      LucideIcons.graduationCap,
    ),
    'tasks' => (context.l10n.homeWidgetTasks, Icons.checklist_rounded),
    'calendar' => (context.l10n.homeSectionCalendar, Icons.event_rounded),
    _ => (context.l10n.dashboardTodayTitle, Icons.auto_graph_rounded),
  };
}
