part of 'dashboard_page.dart';

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.paletteModuleId});

  final UserTask task;
  final String paletteModuleId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: paletteModuleId,
    );
    final boardName = task.list?.board?.name;
    final listName = task.list?.name;
    final locationLabel = [boardName, listName]
        .where((value) => value != null && value.isNotEmpty)
        .cast<String>()
        .join(' • ');
    final dueLabel = _dueLabel(context, task.endDate);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => unawaited(
          openUserTaskBoardDetailWithWorkspace(
            context,
            task,
            workspaceCubit: context.read<WorkspaceCubit>(),
          ),
        ),
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Color.alphaBlend(
              palette.iconBackground.withValues(alpha: 0.5),
              palette.background,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: palette.border.withValues(alpha: 0.46)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.name ?? context.l10n.tasksUntitled,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: palette.textColor,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (locationLabel.isNotEmpty)
                              _DashboardTaskPill(
                                icon: Icons.view_kanban_outlined,
                                label: locationLabel,
                                palette: palette,
                              ),
                            if (task.endDate != null)
                              _DashboardTaskPill(
                                icon: Icons.schedule_outlined,
                                label: dueLabel,
                                palette: palette,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _dueLabel(BuildContext context, DateTime? date) {
    final l10n = context.l10n;
    if (date == null) return l10n.dashboardTaskNoDate;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dueDay = DateTime(date.year, date.month, date.day);
    final delta = dueDay.difference(today).inDays;

    if (delta < 0) return l10n.dashboardTaskOverdue;
    if (delta == 0) return l10n.dashboardTaskToday;
    if (delta == 1) return l10n.dashboardTaskTomorrow;
    final formattedDate = DateFormat('EEE, d MMM').format(date);
    return '${l10n.dashboardTaskUpcoming} • $formattedDate';
  }
}

class _DashboardTaskPill extends StatelessWidget {
  const _DashboardTaskPill({
    required this.icon,
    required this.label,
    required this.palette,
  });

  final IconData icon;
  final String label;
  final AppCardPalette palette;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: palette.iconBackground.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: palette.border.withValues(alpha: 0.46)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: palette.iconColor),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: palette.textColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.paletteModuleId});

  final CalendarEvent event;
  final String paletteModuleId;

  @override
  Widget build(BuildContext context) {
    final start = event.startAt;
    final theme = Theme.of(context);
    final palette = AppCardPalette.resolve(
      context,
      index: 0,
      moduleId: paletteModuleId,
    );
    final dateLabel = start == null
        ? context.l10n.dashboardEventAllDay
        : '${DateFormat('EEE, d MMM').format(start)}'
              ' • ${DateFormat('HH:mm').format(start)}';
    final dayLabel = start == null ? '--' : DateFormat('d').format(start);
    final monthLabel = start == null
        ? context.l10n.dashboardEventAllDay
        : DateFormat('MMM').format(start);
    final detail = event.description?.trim();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          palette.iconBackground.withValues(alpha: 0.5),
          palette.background,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border.withValues(alpha: 0.46)),
      ),
      child: Row(
        children: [
          Container(
            width: 60,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            decoration: BoxDecoration(
              color: palette.background.withValues(alpha: 0.84),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: palette.border.withValues(alpha: 0.44)),
            ),
            child: Column(
              children: [
                Text(
                  dayLabel,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: palette.iconColor,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  monthLabel.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: palette.iconColor.withValues(alpha: 0.92),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  event.title ?? 'Untitled event',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: palette.textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  dateLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: palette.iconColor.withValues(alpha: 0.92),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (detail != null && detail.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: palette.textColor.withValues(alpha: 0.74),
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
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
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            tone.background,
            Color.alphaBlend(
              tone.foreground.withValues(alpha: isDark ? 0.08 : 0.04),
              tone.background,
            ),
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: tone.foreground, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(description, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
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
