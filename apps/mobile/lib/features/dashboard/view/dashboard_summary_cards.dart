part of 'dashboard_page.dart';

/// Greeting, today's date and the workspace chips at the top of Home.
///
/// The shell navbar already carries the "Home" title, so this is a greeting
/// rather than a second page title.
class _HomeHeader extends StatelessWidget {
  const _HomeHeader();

  /// Below this content width the chips move under the greeting.
  static const double _headerRowMinWidth = 560;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final now = DateTime.now();
    final name = context.select<ShellProfileCubit?, String?>((cubit) {
      final profile = cubit?.state.profile;
      final value = profile?.displayName ?? profile?.fullName;
      return value == null || value.trim().isEmpty ? null : value.trim();
    });
    final greeting = switch (now.hour) {
      < 12 when name != null => l10n.homeGreetingMorningNamed(name),
      < 12 => l10n.homeGreetingMorning,
      < 18 when name != null => l10n.homeGreetingAfternoonNamed(name),
      < 18 => l10n.homeGreetingAfternoon,
      _ when name != null => l10n.homeGreetingEveningNamed(name),
      _ => l10n.homeGreetingEvening,
    };
    final greetingBlock = Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            DateFormat.MMMMEEEEd(locale).format(now),
            style: tokens.typography.small.copyWith(
              color: c.mutedForeground,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Semantics(
            header: true,
            child: Text(
              greeting,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.x2Large.copyWith(
                color: c.foreground,
                fontWeight: FontWeight.w700,
                height: 1.2,
                letterSpacing: -0.3,
              ),
            ),
          ),
        ],
      ),
    );

    // Chips sit under the greeting on narrow content and beside it from
    // [_headerRowMinWidth]; the chip row scrolls in both layouts.
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < _headerRowMinWidth) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              greetingBlock,
              const SizedBox(height: AppSpacing.md),
              const HomeWorkspaceChips(),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(child: greetingBlock),
            const SizedBox(width: AppSpacing.lg),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: constraints.maxWidth * 0.45,
              ),
              child: const HomeWorkspaceChips(),
            ),
          ],
        );
      },
    );
  }
}

/// Today's counts: active tasks, overdue tasks and upcoming events.
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
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppSectionCaption(
          l10n.dashboardTodayTitle,
          trailing: const SizedBox(height: 44),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppGroupedCard(
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Metric(
                    value: activeTasks,
                    label: l10n.dashboardActiveTasksLabel,
                  ),
                  VerticalDivider(
                    width: 1,
                    thickness: 0.5,
                    indent: AppSpacing.lg,
                    endIndent: AppSpacing.lg,
                    color: c.border,
                  ),
                  _Metric(
                    value: overdueTasks,
                    label: l10n.dashboardTaskOverdue,
                    tone: overdueTasks > 0 ? AppTone.destructive : null,
                  ),
                  VerticalDivider(
                    width: 1,
                    thickness: 0.5,
                    indent: AppSpacing.lg,
                    endIndent: AppSpacing.lg,
                    color: c.border,
                  ),
                  _Metric(
                    value: nextEvents,
                    label: l10n.dashboardUpcomingEvents,
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.value, required this.label, this.tone});

  final int value;
  final String label;
  final AppTone? tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Expanded(
      child: Semantics(
        container: true,
        label: '$label: $value',
        excludeSemantics: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$value',
                style: tokens.typography.x3Large.copyWith(
                  color: tone?.foreground(c) ?? c.foreground,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.xSmall.copyWith(
                  color: c.mutedForeground,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
