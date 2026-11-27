part of 'dashboard_page.dart';

/// Greeting and today's date at the top of Home.
///
/// The shell navbar already carries the "Home" title, so this is a greeting
/// rather than a second page title.
class _HomeHeader extends StatelessWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final scale = _HomeScaleScope.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final now = HomeWallClock.of(context);
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final name = context.select<ShellProfileCubit?, String?>((cubit) {
      final profile = cubit?.state.profile;
      if (actor == null || profile?.id != actor) return null;
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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            DateFormat.MMMMEEEEd(locale).format(now),
            style: tokens.typography.small.copyWith(
              fontSize: scale.dateSize,
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
                fontSize: scale.greetingSize,
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
  }
}

/// Completed and overdue tasks alongside today's agenda count. Each
/// count opens the list it summarises, so none is a dead number.
class _TodaySummaryCard extends StatelessWidget {
  const _TodaySummaryCard({
    required this.completedTasks,
    required this.overdueTasks,
    required this.todayEvents,
  });

  final int? completedTasks;
  final int? overdueTasks;
  final int? todayEvents;

  @override
  Widget build(BuildContext context) {
    // On tablets and laptops ([_HomeScale.strip]) the card is a KPI strip
    // under the greeting: no caption row, larger numbers.
    final scale = _HomeScaleScope.of(context);
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final card = AppGroupedCard(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Metric(
                key: const ValueKey('home-metric-completed'),
                valueSize: scale.metricSize,
                value: completedTasks,
                label: l10n.tasksCompleted,
                onTap: () => context.go(Routes.tasks),
              ),
              VerticalDivider(
                width: 1,
                thickness: 0.5,
                indent: scale.spacing(AppSpacing.lg),
                endIndent: scale.spacing(AppSpacing.lg),
                color: c.border,
              ),
              _Metric(
                key: const ValueKey('home-metric-overdue'),
                valueSize: scale.metricSize,
                value: overdueTasks,
                label: l10n.dashboardTaskOverdue,
                tone: (overdueTasks ?? 0) > 0 ? AppTone.destructive : null,
                onTap: () => context.go(Routes.tasks),
              ),
              VerticalDivider(
                width: 1,
                thickness: 0.5,
                indent: scale.spacing(AppSpacing.lg),
                endIndent: scale.spacing(AppSpacing.lg),
                color: c.border,
              ),
              _Metric(
                key: const ValueKey('home-metric-events'),
                valueSize: scale.metricSize,
                value: todayEvents,
                label: l10n.calendarAgendaView,
                onTap: () => context.go(Routes.calendar),
              ),
            ],
          ),
        ),
      ],
    );
    if (scale.strip) {
      return Semantics(
        container: true,
        explicitChildNodes: true,
        label: l10n.dashboardTodayTitle,
        child: card,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppSectionCaption(
          l10n.dashboardTodayTitle,
          trailing: const SizedBox(height: 44),
        ),
        const SizedBox(height: AppSpacing.xs),
        card,
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.value,
    required this.label,
    required this.onTap,
    required this.valueSize,
    this.tone,
    super.key,
  });

  final int? value;
  final double valueSize;
  final String label;
  final VoidCallback onTap;
  final AppTone? tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final scale = _HomeScaleScope.of(context);
    final display = value == null
        ? '—'
        : NumberFormat.decimalPattern(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(value);
    return Expanded(
      child: Semantics(
        container: true,
        button: true,
        label: '$label: $display',
        excludeSemantics: true,
        onTap: onTap,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: scale.spacing(AppSpacing.md),
              vertical: scale.spacing(
                scale.desktop ? AppSpacing.xl : AppSpacing.lg,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  display,
                  style: tokens.typography.x3Large.copyWith(
                    fontSize: valueSize,
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
                    fontSize: scale.desktop ? 14 : null,
                    color: c.mutedForeground,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
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
