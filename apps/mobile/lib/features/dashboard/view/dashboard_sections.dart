part of 'dashboard_page.dart';

/// A Home widget: a muted caption with an open link above one grouped card.
class _HomeSection extends StatelessWidget {
  const _HomeSection({
    required this.title,
    required this.actionLabel,
    required this.onOpen,
    required this.children,
    this.dividerInset = AppLayout.rowDividerInset,
  });

  final String title;
  final String actionLabel;
  final VoidCallback onOpen;
  final List<Widget> children;
  final double dividerInset;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    mainAxisSize: MainAxisSize.min,
    children: [
      AppSectionCaption(
        title,
        trailing: _HomeOpenLink(
          label: actionLabel,
          semanticLabel: '$actionLabel $title',
          onTap: onOpen,
        ),
      ),
      const SizedBox(height: AppSpacing.xs),
      AppGroupedCard(dividerInset: dividerInset, children: children),
    ],
  );
}

class _HomeOpenLink extends StatelessWidget {
  const _HomeOpenLink({
    required this.label,
    required this.semanticLabel,
    required this.onTap,
  });

  final String label;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final color = tokens.colorScheme.primary;
    // Its own node (not merged into the caption header). The merged label
    // replaces the child's semantics, so the tap action is declared here.
    return Semantics(
      container: true,
      button: true,
      label: semanticLabel,
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: AppSpacing.sm),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: tokens.typography.small.copyWith(
                    color: color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Icon(AppIcons.forward, size: 16, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Rows of a Home section for a load that has no data yet, failed, or is
/// empty. Returns null once there are rows to show.
///
/// A failure names the section and offers [onRetry]. Pull to refresh still
/// works on touch screens, but the message never depends on it: desktops
/// and keyboards have no pull gesture.
List<Widget>? _homeStateRows(
  BuildContext context, {
  required bool loading,
  required bool failed,
  required bool empty,
  required IconData emptyIcon,
  required String emptyTitle,
  String? sectionTitle,
  FutureOr<void> Function()? onRetry,
  String? emptyMessage,
}) {
  if (loading) return const [AppSkeletonRows()];
  if (failed) {
    final l10n = context.l10n;
    return [
      AppStateMessage.inline(
        icon: LucideIcons.cloudOff,
        tone: AppTone.destructive,
        title: sectionTitle == null
            ? l10n.commonSomethingWentWrong
            : l10n.homeSectionLoadFailedTitle(sectionTitle),
        message: l10n.homeSectionLoadFailed,
        actionLabel: onRetry == null ? null : l10n.commonRetry,
        onAction: onRetry,
      ),
    ];
  }
  if (empty) {
    return [
      AppStateMessage.inline(
        icon: emptyIcon,
        title: emptyTitle,
        message: emptyMessage,
      ),
    ];
  }
  return null;
}

/// One half of the tasks Home widget: Today (overdue and due today) or Up
/// next (later). Each half is its own grid card so wide layouts can balance
/// them across columns.
class _TaskSection extends StatelessWidget {
  const _TaskSection.today({
    required this.state,
    required this.tasks,
    required this.onRetry,
  }) : upNext = false;

  const _TaskSection.upNext({
    required this.state,
    required this.tasks,
    required this.onRetry,
  }) : upNext = true;

  final TaskListState state;
  final List<UserTask> tasks;
  final bool upNext;
  final FutureOr<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = upNext ? l10n.homeSectionUpNext : l10n.homeSectionToday;
    final loading =
        state.status == TaskListStatus.loading && !state.hasLoadedOnce;
    final failed =
        state.status == TaskListStatus.error &&
        state.totalActiveTasks == 0 &&
        state.overdueTasks.isEmpty &&
        state.todayTasks.isEmpty &&
        state.upcomingTasks.isEmpty;
    return _HomeSection(
      title: title,
      actionLabel: l10n.homeSeeAll,
      onOpen: () => context.go(Routes.tasks),
      children:
          _homeStateRows(
            context,
            loading: loading,
            failed: failed,
            empty: tasks.isEmpty,
            emptyIcon: upNext
                ? LucideIcons.calendarClock
                : LucideIcons.circleCheck,
            emptyTitle: upNext ? l10n.homeUpNextEmpty : l10n.homeTodayEmpty,
            sectionTitle: title,
            onRetry: onRetry,
          ) ??
          [for (final task in tasks) _TaskRow(task: task)],
    );
  }
}

class _UpcomingEventsBlock extends StatelessWidget {
  const _UpcomingEventsBlock({
    required this.status,
    required this.hasLoadedOnce,
    required this.events,
    required this.onRetry,
  });

  final CalendarStatus status;
  final bool hasLoadedOnce;
  final List<CalendarEvent> events;
  final FutureOr<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => _HomeSection(
    title: context.l10n.homeSectionCalendar,
    actionLabel: context.l10n.homeSeeAll,
    onOpen: () => context.go(Routes.calendar),
    dividerInset: _EventRow.dividerInset,
    children:
        _homeStateRows(
          context,
          loading: status == CalendarStatus.loading && !hasLoadedOnce,
          failed: status == CalendarStatus.error && events.isEmpty,
          empty: events.isEmpty,
          emptyIcon: LucideIcons.calendarCheck,
          emptyTitle: context.l10n.homeCalendarEmpty,
          sectionTitle: context.l10n.homeSectionCalendar,
          onRetry: onRetry,
        ) ??
        [for (final event in events) _EventRow(event: event)],
  );
}
