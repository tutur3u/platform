import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'habit_tracker_detail_lists.dart';

class HabitTrackerDetailSheet extends StatelessWidget {
  const HabitTrackerDetailSheet({
    required this.detailStatus,
    required this.detailError,
    required this.isDetailRefreshing,
    required this.isSubmittingEntry,
    required this.isSubmittingStreakAction,
    required this.isArchivingTracker,
    required this.onRetry,
    required this.onLogEntry,
    required this.onEditTracker,
    required this.onDeleteEntry,
    required this.onApplyStreakAction,
    required this.onArchiveTracker,
    this.onRefresh,
    this.showLeaderboard = true,
    super.key,
    this.detail,
  });

  final HabitTrackerDetailResponse? detail;
  final HabitsStatus detailStatus;
  final String? detailError;
  final bool isDetailRefreshing;
  final bool isSubmittingEntry;
  final bool isSubmittingStreakAction;
  final bool isArchivingTracker;
  final Future<void> Function() onRetry;

  /// Pull-to-refresh reload for the entries and leaderboard tabs; falls back
  /// to [onRetry] when absent.
  final Future<void> Function()? onRefresh;
  final Future<void> Function() onLogEntry;
  final Future<void> Function() onEditTracker;
  final Future<void> Function(String entryId) onDeleteEntry;
  final Future<void> Function(HabitTrackerStreakActionInput input)
  onApplyStreakAction;
  final Future<void> Function() onArchiveTracker;
  final bool showLeaderboard;

  @override
  Widget build(BuildContext context) {
    final height = context.isCompact
        ? MediaQuery.sizeOf(context).height * 0.92
        : 760.0;
    final tabs = [
      Tab(text: context.l10n.habitsOverviewTab),
      Tab(text: context.l10n.habitsEntriesTab),
      if (showLeaderboard) Tab(text: context.l10n.habitsLeaderboardTab),
    ];

    return LayoutBuilder(
      builder: (context, constraints) => SizedBox(
        height: constraints.hasBoundedHeight
            ? math.min(height, constraints.maxHeight)
            : height,
        child: Material(
          type: MaterialType.transparency,
          child: DefaultTabController(
            length: tabs.length,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: detailStatus == HabitsStatus.loading && detail == null
                  ? const AppLoadingIndicator.page()
                  : detailStatus == HabitsStatus.error && detail == null
                  ? _DetailErrorView(error: detailError, onRetry: onRetry)
                  : detail == null
                  ? const SizedBox.shrink()
                  : Builder(
                      builder: (context) {
                        final currentDetail = detail!;
                        final tabViews = [
                          _OverviewTab(
                            detail: currentDetail,
                            isSubmittingStreakAction: isSubmittingStreakAction,
                            onApplyStreakAction: onApplyStreakAction,
                          ),
                          _EntriesTab(
                            detail: currentDetail,
                            isSubmittingEntry: isSubmittingEntry,
                            onRefresh: onRefresh ?? onRetry,
                            onDeleteEntry: (entryId) =>
                                _confirmDeleteEntry(context, entryId),
                          ),
                          if (showLeaderboard)
                            _LeaderboardTab(
                              detail: currentDetail,
                              onRefresh: onRefresh ?? onRetry,
                            ),
                        ];

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Overlaid so a refresh never shrinks the tabs.
                            Stack(
                              children: [
                                _Header(
                                  detail: currentDetail,
                                  isArchivingTracker: isArchivingTracker,
                                  onLogEntry: onLogEntry,
                                  onEditTracker: onEditTracker,
                                  onArchiveTracker: () =>
                                      _confirmArchive(context),
                                ),
                                if (isDetailRefreshing)
                                  const PositionedDirectional(
                                    top: 0,
                                    end: 0,
                                    child: AppLoadingIndicator.inline(),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            TabBar(tabs: tabs),
                            const SizedBox(height: 12),
                            Expanded(child: TabBarView(children: tabViews)),
                          ],
                        );
                      },
                    ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _confirmArchive(BuildContext context) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AsyncDeleteConfirmationDialog(
        title: context.l10n.habitsArchiveTrackerTitle,
        message: context.l10n.habitsArchiveTrackerMessage,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.habitsArchiveTrackerAction,
        toastContext: toastContext,
        onConfirm: onArchiveTracker,
      ),
    );
    if (!context.mounted) return;
    await Navigator.of(context).maybePop();
  }

  Future<void> _confirmDeleteEntry(BuildContext context, String entryId) async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AsyncDeleteConfirmationDialog(
        title: context.l10n.habitsDeleteEntryTitle,
        message: context.l10n.habitsDeleteEntryMessage,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.habitsDeleteEntryAction,
        toastContext: toastContext,
        onConfirm: () => onDeleteEntry(entryId),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.detail,
    required this.isArchivingTracker,
    required this.onLogEntry,
    required this.onEditTracker,
    required this.onArchiveTracker,
  });

  final HabitTrackerDetailResponse detail;
  final bool isArchivingTracker;
  final Future<void> Function() onLogEntry;
  final Future<void> Function() onEditTracker;
  final VoidCallback onArchiveTracker;

  @override
  Widget build(BuildContext context) {
    final accent = habitTrackerColor(context, detail.tracker.color);
    final currentValue = detail.currentMember?.currentPeriodTotal ?? 0;
    final primaryField = primaryFieldForTracker(detail.tracker);
    final latestValue =
        detail.currentMember?.latestValues?[detail.tracker.primaryMetricKey] ??
        detail.currentMember?.latestValue;
    final latestValueLabel = latestValue == null
        ? formatCompactNumber(currentValue)
        : formatFieldValue(primaryField, latestValue);

    return FinancePanel(
      padding: const EdgeInsets.all(20),
      backgroundColor: accent.withValues(alpha: 0.08),
      borderColor: accent.withValues(alpha: 0.24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: accent.withValues(alpha: 0.14),
                ),
                child: Icon(
                  habitTrackerIcon(detail.tracker.icon),
                  color: accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      detail.tracker.name,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(detail.tracker.description ?? ''),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => unawaited(Navigator.of(context).maybePop()),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                label: context.l10n.habitsSummaryVolume,
                value: latestValueLabel,
                tint: accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsCurrentStreak,
                value: '${detail.currentMember?.streak.currentStreak ?? 0}',
                tint: accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsSummaryTargetsMet,
                value:
                    '${formatCompactNumber(currentValue)} / ${formatCompactNumber(detail.tracker.targetValue)}',
                tint: accent,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              shad.PrimaryButton(
                onPressed: () {
                  unawaited(onLogEntry());
                },
                child: Text(context.l10n.habitsLogEntryAction),
              ),
              shad.OutlineButton(
                onPressed: () {
                  unawaited(onEditTracker());
                },
                child: Text(context.l10n.habitsEditTrackerAction),
              ),
              shad.DestructiveButton(
                onPressed: isArchivingTracker ? null : onArchiveTracker,
                child: Text(context.l10n.habitsArchiveTrackerAction),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.detail,
    required this.isSubmittingStreakAction,
    required this.onApplyStreakAction,
  });

  final HabitTrackerDetailResponse detail;
  final bool isSubmittingStreakAction;
  final Future<void> Function(HabitTrackerStreakActionInput input)
  onApplyStreakAction;

  @override
  Widget build(BuildContext context) {
    final tracker = detail.tracker;
    final currentMember = detail.currentMember;
    final team = detail.team;
    final l10n = context.l10n;
    final consistencyPercent =
        ((currentMember?.streak.consistencyRate ?? 0) * 100).round();

    return ListView(
      children: [
        if (currentMember != null)
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: l10n.habitsCurrentStreak,
                  value: '${currentMember.streak.currentStreak}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: l10n.habitsBestStreak,
                  value: '${currentMember.streak.bestStreak}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: l10n.habitsConsistencyLabel,
                  value: '$consistencyPercent%',
                ),
              ),
            ],
          ),
        if (currentMember != null) const SizedBox(height: 14),
        if (currentMember != null &&
            currentMember.streak.recoveryWindow.eligible) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: Theme.of(context).colorScheme.surfaceContainerLow,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.habitsRecoveryWindowTitle,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(l10n.habitsRecoveryWindowDescription),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    shad.OutlineButton(
                      onPressed: isSubmittingStreakAction
                          ? null
                          : () => onApplyStreakAction(
                              HabitTrackerStreakActionInput(
                                actionType: HabitTrackerStreakActionType.repair,
                                periodStart:
                                    currentMember
                                        .streak
                                        .recoveryWindow
                                        .periodStart ??
                                    '',
                              ),
                            ),
                      child: Text(l10n.habitsRepairStreakAction),
                    ),
                    shad.OutlineButton(
                      onPressed: isSubmittingStreakAction
                          ? null
                          : () => onApplyStreakAction(
                              HabitTrackerStreakActionInput(
                                actionType: HabitTrackerStreakActionType.freeze,
                                periodStart:
                                    currentMember
                                        .streak
                                        .recoveryWindow
                                        .periodStart ??
                                    '',
                              ),
                            ),
                      child: Text(l10n.habitsUseFreezeAction),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
        if (detail.currentPeriodMetrics.isNotEmpty) ...[
          Text(
            l10n.habitsCurrentPeriodMetricsTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          for (final metric in detail.currentPeriodMetrics) ...[
            _MetricRow(
              title: '${metric.periodStart} - ${metric.periodEnd}',
              subtitle:
                  '${formatCompactNumber(metric.total)} • '
                  '${l10n.habitsEntriesCountLabel(metric.entryCount)}',
              trailing: metric.success
                  ? l10n.habitsMetricMet
                  : l10n.habitsMetricPending,
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 14),
        ],
        if (detail.memberSummaries.isNotEmpty) ...[
          Text(
            l10n.habitsMemberSummariesTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          for (final summary in detail.memberSummaries) ...[
            _MetricRow(
              title: summary.member.label,
              subtitle:
                  '${formatCompactNumber(summary.currentPeriodTotal)} / ${formatCompactNumber(tracker.targetValue)}',
              trailing: l10n.habitsStreakChip(summary.streak.currentStreak),
            ),
            const SizedBox(height: 8),
          ],
        ],
        if (team != null) ...[
          const SizedBox(height: 14),
          Text(
            l10n.habitsTeamSummaryTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: l10n.habitsTeamMembers,
                  value: '${team.activeMembers}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: l10n.habitsTopStreakLabel,
                  value: '${team.topStreak}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: l10n.habitsEntriesLabel,
                  value: '${team.totalEntries}',
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Theme.of(context).colorScheme.surfaceContainerLow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  final String title;
  final String subtitle;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: Theme.of(context).colorScheme.surfaceContainerLow,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(subtitle),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(trailing),
        ],
      ),
    );
  }
}

class _DetailErrorView extends StatelessWidget {
  const _DetailErrorView({required this.error, required this.onRetry});

  final String? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 44),
          const SizedBox(height: 12),
          Text(error ?? context.l10n.habitsLoadError),
          const SizedBox(height: 12),
          shad.OutlineButton(
            onPressed: onRetry,
            child: Text(context.l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
