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
List<Widget>? _homeStateRows(
  BuildContext context, {
  required bool loading,
  required bool failed,
  required bool empty,
  required IconData emptyIcon,
  required String emptyTitle,
  String? emptyMessage,
}) {
  if (loading) return const [AppSkeletonRows()];
  if (failed) {
    return [
      AppStateMessage.inline(
        icon: LucideIcons.cloudOff,
        tone: AppTone.destructive,
        title: context.l10n.commonSomethingWentWrong,
        message: context.l10n.homeSectionLoadFailed,
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

/// Today (overdue and due today) and Up next (later), as two sections.
class _TaskSectionsBlock extends StatelessWidget {
  const _TaskSectionsBlock({
    required this.state,
    required this.today,
    required this.upNext,
  });

  final TaskListState state;
  final List<UserTask> today;
  final List<UserTask> upNext;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final loading =
        state.status == TaskListStatus.loading && !state.hasLoadedOnce;
    final failed =
        state.status == TaskListStatus.error &&
        state.totalActiveTasks == 0 &&
        today.isEmpty &&
        upNext.isEmpty;
    Widget section(
      String title,
      List<UserTask> tasks,
      IconData emptyIcon,
      String emptyTitle,
    ) => _HomeSection(
      title: title,
      actionLabel: l10n.homeSeeAll,
      onOpen: () => context.go(Routes.tasks),
      children:
          _homeStateRows(
            context,
            loading: loading,
            failed: failed,
            empty: tasks.isEmpty,
            emptyIcon: emptyIcon,
            emptyTitle: emptyTitle,
          ) ??
          [for (final task in tasks) _TaskRow(task: task)],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        section(
          l10n.homeSectionToday,
          today,
          LucideIcons.circleCheck,
          l10n.homeTodayEmpty,
        ),
        const SizedBox(height: AppLayout.sectionGap),
        section(
          l10n.homeSectionUpNext,
          upNext,
          LucideIcons.calendarClock,
          l10n.homeUpNextEmpty,
        ),
      ],
    );
  }
}

class _UpcomingEventsBlock extends StatelessWidget {
  const _UpcomingEventsBlock({
    required this.status,
    required this.hasLoadedOnce,
    required this.events,
  });

  final CalendarStatus status;
  final bool hasLoadedOnce;
  final List<CalendarEvent> events;

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
        ) ??
        [for (final event in events) _EventRow(event: event)],
  );
}
