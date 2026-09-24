part of 'dashboard_page.dart';

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.accentModuleId,
    required this.title,
    required this.icon,
    required this.actionLabel,
    required this.onTap,
    required this.child,
  });

  final String accentModuleId;
  final String title;
  final IconData icon;
  final String actionLabel;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: accentModuleId,
    );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border.withValues(alpha: 0.9)),
        boxShadow: [
          BoxShadow(
            color: palette.shadow.withValues(alpha: 0.72),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: palette.iconBackground,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: palette.border.withValues(alpha: 0.42),
                  ),
                ),
                child: Icon(icon, size: 20, color: palette.iconColor),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              _SectionActionChip(
                label: actionLabel,
                palette: palette,
                onTap: onTap,
              ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _SectionActionChip extends StatelessWidget {
  const _SectionActionChip({
    required this.label,
    required this.palette,
    required this.onTap,
  });

  final String label;
  final AppCardPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: palette.iconBackground.withValues(alpha: 0.86),
            border: Border.all(color: palette.border.withValues(alpha: 0.5)),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: palette.textColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

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
    if (state.status == TaskListStatus.loading && !state.hasLoadedOnce) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: NovaLoadingIndicator()),
      );
    }

    if (state.status == TaskListStatus.error &&
        state.totalActiveTasks == 0 &&
        tasks.isEmpty) {
      return _EmptyHint(
        title: context.l10n.dashboardAssignedToMe,
        description: context.l10n.commonSomethingWentWrong,
        icon: Icons.cloud_off_outlined,
        tone: _Tone(
          background: Theme.of(
            context,
          ).colorScheme.errorContainer.withValues(alpha: 0.38),
          border: Theme.of(context).colorScheme.error.withValues(alpha: 0.16),
          foreground: Theme.of(context).colorScheme.error,
        ),
      );
    }

    if (state.totalActiveTasks == 0 || tasks.isEmpty) {
      final palette = AppCardPalette.resolve(
        context,
        index: 0,
        moduleId: paletteModuleId,
      );
      return _EmptyHint(
        title: context.l10n.dashboardNoAssignedTasks,
        description: context.l10n.dashboardNoAssignedTasksDescription,
        icon: Icons.task_alt_rounded,
        tone: _Tone(
          background: palette.iconBackground.withValues(alpha: 0.72),
          border: palette.border.withValues(alpha: 0.46),
          foreground: palette.iconColor,
        ),
      );
    }

    return Column(
      children: [
        for (var index = 0; index < tasks.length; index++) ...[
          _TaskRow(task: tasks[index], paletteModuleId: paletteModuleId),
          if (index != tasks.length - 1) const SizedBox(height: 10),
        ],
      ],
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
    if (status == CalendarStatus.loading && !hasLoadedOnce) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: NovaLoadingIndicator()),
      );
    }

    if (status == CalendarStatus.error && events.isEmpty) {
      return _EmptyHint(
        title: context.l10n.dashboardUpcomingEvents,
        description: error?.trim().isNotEmpty == true
            ? context.l10n.commonSomethingWentWrong
            : context.l10n.commonSomethingWentWrong,
        icon: Icons.cloud_off_outlined,
        tone: _Tone(
          background: Theme.of(
            context,
          ).colorScheme.errorContainer.withValues(alpha: 0.38),
          border: Theme.of(context).colorScheme.error.withValues(alpha: 0.16),
          foreground: Theme.of(context).colorScheme.error,
        ),
      );
    }

    if (events.isEmpty) {
      final palette = AppCardPalette.resolve(
        context,
        index: 0,
        moduleId: paletteModuleId,
      );
      return _EmptyHint(
        title: context.l10n.dashboardNoUpcomingEvents,
        description: context.l10n.dashboardNoUpcomingEventsDescription,
        icon: Icons.event_available_rounded,
        tone: _Tone(
          background: palette.iconBackground.withValues(alpha: 0.72),
          border: palette.border.withValues(alpha: 0.46),
          foreground: palette.iconColor,
        ),
      );
    }

    return Column(
      children: [
        for (var index = 0; index < events.length; index++) ...[
          _EventRow(event: events[index], paletteModuleId: paletteModuleId),
          if (index != events.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}
