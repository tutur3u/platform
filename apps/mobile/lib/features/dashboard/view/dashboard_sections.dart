part of 'dashboard_page.dart';

class _DashboardWorkspacePickerCard extends StatelessWidget {
  const _DashboardWorkspacePickerCard();
  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, Workspace?>(
      (cubit) => cubit.state.currentWorkspace,
    );
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: workspace == null
          ? null
          : WorkspaceAvatar(workspace: workspace, radius: 20),
      title: Text(
        displayWorkspaceNameOrFallback(context, workspace),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Text(context.l10n.settingsCurrentWorkspace),
      trailing: const Icon(Icons.unfold_more, size: 20),
      onTap: () => showWorkspacePickerSheet(context),
    );
  }
}

class _TodaySummaryCard extends StatelessWidget {
  const _TodaySummaryCard({
    required this.activeTasks,
    required this.overdueTasks,
    required this.nextEvents,
  });
  final int? activeTasks;
  final int? overdueTasks;
  final int? nextEvents;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final metrics = [
      (activeTasks, context.l10n.dashboardActiveTasksLabel, Routes.tasks),
      (overdueTasks, context.l10n.dashboardTaskOverdue, Routes.tasks),
      (nextEvents, context.l10n.dashboardUpcomingEvents, Routes.calendar),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          DateFormat.yMMMMEEEEd(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(DateTime.now()),
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          context.l10n.dashboardTodayTitle,
          style: theme.textTheme.headlineLarge?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 18),
        Material(
          color: theme.colorScheme.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(16),
          clipBehavior: Clip.antiAlias,
          child: IntrinsicHeight(
            child: Row(
              children: [
                for (var i = 0; i < metrics.length; i++) ...[
                  if (i > 0)
                    const VerticalDivider(width: 1, indent: 18, endIndent: 18),
                  Expanded(
                    child: InkWell(
                      onTap: () => context.go(metrics[i].$3),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 18,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              metrics[i].$1?.toString() ?? '—',
                              style: theme.textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              metrics[i].$2,
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _DashboardQuickLaunchCard extends StatelessWidget {
  const _DashboardQuickLaunchCard();
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 4,
    children: [
      for (final action in [
        (Icons.checklist_rounded, context.l10n.tasksTitle, Routes.tasks),
        (
          Icons.view_kanban_outlined,
          context.l10n.taskBoardsTitle,
          Routes.taskBoards,
        ),
        (
          Icons.calendar_today_outlined,
          context.l10n.calendarTitle,
          Routes.calendar,
        ),
        (Icons.apps_outlined, context.l10n.navApps, Routes.apps),
      ])
        TextButton.icon(
          onPressed: () => context.go(action.$3),
          icon: Icon(action.$1, size: 18),
          label: Text(action.$2),
        ),
    ],
  );
}

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
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          TextButton(onPressed: onTap, child: Text(actionLabel)),
        ],
      ),
      Material(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: child,
      ),
    ],
  );
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({
    required this.title,
    required this.description,
    required this.icon,
    required this.tone,
  });
  final String title;
  final String description;
  final IconData icon;
  final _Tone tone;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(20),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 22, color: tone.foreground),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(description, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    ),
  );
}

class _Tone {
  const _Tone({
    required this.background,
    required this.border,
    required this.foreground,
  });
  final Color background;
  final Color border;
  final Color foreground;
}
