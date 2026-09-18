part of 'dashboard_page.dart';

class _DashboardWorkspacePickerCard extends StatelessWidget {
  const _DashboardWorkspacePickerCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final palette = _dashboardPalette(context, 0);

    return BlocBuilder<WorkspaceCubit, WorkspaceState>(
      buildWhen: (previous, current) =>
          previous.currentWorkspace != current.currentWorkspace,
      builder: (context, state) {
        final currentWorkspace = state.currentWorkspace;
        final workspaceName = displayWorkspaceNameOrFallback(
          context,
          currentWorkspace,
        );

        return Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => showWorkspacePickerSheet(context),
            child: Ink(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: palette.background,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color.alphaBlend(
                      palette.iconBackground.withValues(alpha: 0.36),
                      palette.background,
                    ),
                    palette.background,
                  ],
                ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: palette.border.withValues(alpha: 0.86),
                ),
                boxShadow: [
                  BoxShadow(
                    color: palette.shadow.withValues(alpha: 0.72),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                children: [
                  if (currentWorkspace != null)
                    WorkspaceAvatar(workspace: currentWorkspace, radius: 20)
                  else
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: colorScheme.primary.withValues(alpha: 0.14),
                        ),
                      ),
                      child: Icon(
                        Icons.workspaces_outlined,
                        size: 21,
                        color: colorScheme.onPrimaryContainer,
                      ),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.l10n.settingsCurrentWorkspace,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: palette.textColor.withValues(alpha: 0.72),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          workspaceName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: palette.textColor,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: palette.iconBackground.withValues(alpha: 0.82),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: palette.border.withValues(alpha: 0.44),
                      ),
                    ),
                    child: Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 20,
                      color: palette.iconColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TodaySummaryCard extends StatelessWidget {
  const _TodaySummaryCard({
    required this.activeTasks,
    required this.overdueTasks,
    required this.nextEvents,
  });

  final int activeTasks;
  final int overdueTasks;
  final int nextEvents;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateLabel = DateFormat('EEE, d MMM').format(DateTime.now());
    final summaryPalette = _dashboardPalette(context, 1);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: summaryPalette.background,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              summaryPalette.iconBackground.withValues(alpha: 0.26),
              summaryPalette.background,
            ),
            Color.alphaBlend(
              summaryPalette.iconColor.withValues(alpha: 0.12),
              summaryPalette.background,
            ),
            summaryPalette.background,
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: summaryPalette.border.withValues(alpha: 0.9)),
        boxShadow: [
          BoxShadow(
            color: summaryPalette.shadow.withValues(alpha: 0.78),
            blurRadius: 18,
            offset: const Offset(0, 9),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.dashboardTodayTitle,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: summaryPalette.textColor,
                    fontWeight: FontWeight.w900,
                    height: 1.08,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: summaryPalette.iconBackground.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: summaryPalette.border.withValues(alpha: 0.42),
                  ),
                ),
                child: Text(
                  dateLabel,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: summaryPalette.textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final compactWidth = (constraints.maxWidth - 10) / 2;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: compactWidth,
                    child: _MetricTile(
                      value: '$activeTasks',
                      label: context.l10n.dashboardActiveTasksLabel,
                      icon: Icons.task_alt_rounded,
                      palette: summaryPalette,
                    ),
                  ),
                  SizedBox(
                    width: compactWidth,
                    child: _MetricTile(
                      value: '$overdueTasks',
                      label: context.l10n.dashboardTaskOverdue,
                      icon: Icons.warning_amber_rounded,
                      palette: summaryPalette,
                    ),
                  ),
                  SizedBox(
                    width: constraints.maxWidth,
                    child: _MetricTile(
                      value: '$nextEvents',
                      label: context.l10n.dashboardUpcomingEvents,
                      icon: Icons.calendar_month_rounded,
                      palette: summaryPalette,
                      fullWidth: true,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.value,
    required this.label,
    required this.icon,
    required this.palette,
    this.fullWidth = false,
  });

  final String value;
  final String label;
  final IconData icon;
  final AppCardPalette palette;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: fullWidth ? 14 : 12,
        vertical: fullWidth ? 14 : 12,
      ),
      decoration: BoxDecoration(
        color: palette.iconBackground.withValues(alpha: fullWidth ? 0.86 : 0.9),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border.withValues(alpha: 0.5)),
      ),
      child: fullWidth
          ? Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: palette.background.withValues(alpha: 0.74),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, size: 18, color: palette.iconColor),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: palette.textColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  value,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 16, color: palette.iconColor),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: palette.textColor.withValues(alpha: 0.78),
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                  ),
                ),
              ],
            ),
    );
  }
}

class _DashboardQuickLaunchCard extends StatelessWidget {
  const _DashboardQuickLaunchCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = _dashboardPalette(context, 2);
    final actions = [
      _QuickLaunchAction(
        label: context.l10n.tasksTitle,
        icon: Icons.checklist_rounded,
        onTap: () => context.go(Routes.tasks),
      ),
      _QuickLaunchAction(
        label: context.l10n.taskBoardsTitle,
        icon: Icons.view_kanban_rounded,
        onTap: () => context.go(Routes.taskBoards),
      ),
      _QuickLaunchAction(
        label: context.l10n.calendarTitle,
        icon: Icons.calendar_month_rounded,
        onTap: () => context.go(Routes.calendar),
      ),
      _QuickLaunchAction(
        label: context.l10n.navApps,
        icon: Icons.grid_view_rounded,
        onTap: () => context.go(Routes.apps),
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(14),
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
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: palette.iconBackground,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                    color: palette.border.withValues(alpha: 0.42),
                  ),
                ),
                child: Icon(
                  Icons.bolt_rounded,
                  size: 22,
                  color: palette.iconColor,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  context.l10n.dashboardQuickLaunch,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final tileWidth = (constraints.maxWidth - 10) / 2;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final action in actions)
                    SizedBox(
                      width: tileWidth,
                      child: _QuickLaunchTile(action: action, palette: palette),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _QuickLaunchAction {
  const _QuickLaunchAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _QuickLaunchTile extends StatelessWidget {
  const _QuickLaunchTile({required this.action, required this.palette});

  final _QuickLaunchAction action;
  final AppCardPalette palette;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: action.onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          height: 76,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: palette.iconBackground.withValues(alpha: 0.86),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: palette.border.withValues(alpha: 0.46)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(action.icon, size: 20, color: palette.iconColor),
              Text(
                action.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelLarge?.copyWith(
                  color: palette.textColor,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
