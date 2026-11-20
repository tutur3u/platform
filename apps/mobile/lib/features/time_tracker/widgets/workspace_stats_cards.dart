part of 'workspace_stats_tab.dart';

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);

    return LayoutBuilder(
      builder: (context, constraints) => SizedBox(
        width: constraints.maxWidth.isFinite && constraints.maxWidth > 8
            ? ((constraints.maxWidth - 8) / 2).floorToDouble()
            : 160,
        child: AppCard(
          padding: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, size: 18, color: color),
                ),
                const AppGap(AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const AppGap(AppSpacing.xxs),
                      Text(
                        label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ManagementSessionTile extends StatelessWidget {
  const _ManagementSessionTile({
    required this.session,
    required this.durationLabel,
  });

  final TimeTrackingSession session;
  final String durationLabel;

  @override
  Widget build(BuildContext context) {
    final theme = AppTokens.of(context);
    final timeFormat = DateFormat.jm();
    final start = session.startTime?.toLocal();
    final end = session.endTime?.toLocal();
    final subtitle = start != null && end != null
        ? '${timeFormat.format(start)} - ${timeFormat.format(end)}'
        : start != null
        ? '${timeFormat.format(start)} - ${context.l10n.timerRunning}'
        : context.l10n.commonSomethingWentWrong;

    return AppCard(
      padding: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                session.isRunning ? LucideIcons.play : LucideIcons.clock3,
                size: 18,
                color: theme.colorScheme.primary,
              ),
            ),
            const AppGap(AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (session.title?.trim().isNotEmpty ?? false)
                        ? session.title!.trim()
                        : context.l10n.timerRunningSessionNoTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const AppGap(AppSpacing.xs),
                  Text(
                    subtitle,
                    style: theme.typography.xSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  if (session.categoryName?.trim().isNotEmpty ?? false) ...[
                    const AppGap(AppSpacing.sm),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(
                          alpha: 0.10,
                        ),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        session.categoryName!.trim(),
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const AppGap(AppSpacing.md),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  durationLabel,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (session.isRunning) ...[
                  const AppGap(AppSpacing.xs),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: context.dynamicColors.purple.withValues(
                        alpha: 0.12,
                      ),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      context.l10n.timerRunning,
                      style: theme.typography.xSmall.copyWith(
                        color: context.dynamicColors.purple,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
