part of 'dashboard_page.dart';

class _AssignedTasksBlock extends StatelessWidget {
  const _AssignedTasksBlock({
    required this.state,
    required this.tasks,
    required this.paletteModuleId,
  });
  final TaskListState state;
  final List<UserTask> tasks;
  final String paletteModuleId;
  @override
  Widget build(BuildContext context) {
    if (!state.hasLoadedOnce && state.status == TaskListStatus.loading) {
      return const _DashboardLoadingRows();
    }
    if (tasks.isEmpty) {
      return ListTile(
        contentPadding: const EdgeInsets.all(20),
        leading: Icon(
          state.status == TaskListStatus.error
              ? Icons.cloud_off_outlined
              : Icons.task_alt,
        ),
        title: Text(
          state.status == TaskListStatus.error
              ? context.l10n.commonSomethingWentWrong
              : context.l10n.dashboardNoAssignedTasks,
        ),
        trailing: state.status == TaskListStatus.error
            ? IconButton(
                tooltip: context.l10n.commonRetry,
                icon: const Icon(Icons.refresh),
                onPressed: () =>
                    unawaited(context.read<TaskListCubit>().reload()),
              )
            : null,
        subtitle: state.status == TaskListStatus.error
            ? null
            : Text(context.l10n.dashboardNoAssignedTasksDescription),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < tasks.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: 48),
          _TaskRow(task: tasks[i]),
        ],
      ],
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task});
  final UserTask task;
  @override
  Widget build(BuildContext context) {
    final location = [
      task.list?.board?.name,
      task.list?.name,
    ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');
    final date = task.endDate?.toLocal();
    final today = DateUtils.dateOnly(DateTime.now());
    final overdue = date != null && DateUtils.dateOnly(date).isBefore(today);
    final dateLabel = date == null
        ? null
        : overdue
        ? context.l10n.dashboardTaskOverdue
        : DateUtils.isSameDay(date, today)
        ? context.l10n.dashboardTaskToday
        : DateFormat.MMMd(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(date);
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: const Icon(Icons.radio_button_unchecked, size: 20),
      title: Text(
        task.name ?? context.l10n.tasksUntitled,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        [
          if (location.isNotEmpty) location,
          if (dateLabel != null) dateLabel,
        ].join(' · '),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: const Icon(Icons.chevron_right, size: 18),
      onTap: () => unawaited(
        openUserTaskBoardDetailWithWorkspace(
          context,
          task,
          workspaceCubit: context.read<WorkspaceCubit>(),
        ),
      ),
    );
  }
}

class _UpcomingEventsBlock extends StatelessWidget {
  const _UpcomingEventsBlock({
    required this.status,
    required this.hasLoadedOnce,
    required this.error,
    required this.events,
    required this.paletteModuleId,
  });
  final CalendarStatus status;
  final bool hasLoadedOnce;
  final String? error;
  final List<CalendarEvent> events;
  final String paletteModuleId;
  @override
  Widget build(BuildContext context) {
    if (!hasLoadedOnce && status == CalendarStatus.loading) {
      return const _DashboardLoadingRows();
    }
    if (events.isEmpty) {
      return ListTile(
        contentPadding: const EdgeInsets.all(20),
        leading: Icon(
          status == CalendarStatus.error
              ? Icons.cloud_off_outlined
              : Icons.event_available_outlined,
        ),
        title: Text(
          status == CalendarStatus.error
              ? context.l10n.commonSomethingWentWrong
              : context.l10n.dashboardNoUpcomingEvents,
        ),
        subtitle: status == CalendarStatus.error
            ? null
            : Text(context.l10n.dashboardNoUpcomingEventsDescription),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < events.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: 64),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 8,
            ),
            leading: SizedBox(
              width: 48,
              child: Text(
                events[i].startAt == null
                    ? context.l10n.dashboardEventAllDay
                    : DateFormat.Hm().format(events[i].startAt!.toLocal()),
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            title: Text(
              events[i].title ?? context.l10n.calendarTitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            subtitle: events[i].startAt == null
                ? null
                : Text(
                    DateFormat.MMMEd(
                      Localizations.localeOf(context).toLanguageTag(),
                    ).format(events[i].startAt!.toLocal()),
                  ),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => context.go(Routes.calendar),
          ),
        ],
      ],
    );
  }
}

class _DashboardLoadingRows extends StatelessWidget {
  const _DashboardLoadingRows();
  @override
  Widget build(BuildContext context) => Semantics(
    label: context.l10n.commonLoading,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          for (final width in [double.infinity, 180.0, double.infinity])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  height: 14,
                  width: width,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainer,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
