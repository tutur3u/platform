import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/l10n/l10n.dart';

/// Height of [FinancePeriodBar] at the ambient text scale: the granularity
/// line and the period label stacked between the steppers.
double financePeriodBarExtent(BuildContext context) =>
    math.max(64, MediaQuery.textScalerOf(context).scale(36) + 28);

/// Granularities the transaction list offers.
const List<FinancePeriodKind> financeAllPeriodKinds = FinancePeriodKind.values;

/// Granularities of charts that need several buckets.
const List<FinancePeriodKind> financeChartPeriodKinds = [
  FinancePeriodKind.week,
  FinancePeriodKind.month,
  FinancePeriodKind.year,
];

/// Period selector: previous and next steppers around one title that names
/// the granularity above the period label. The title opens the granularity
/// sheet ([kinds], plus Custom range and All time when their callbacks are
/// set); each choice shows the period it lands on. Choosing the current
/// granularity again returns to the period containing [now]. Next is
/// disabled past [now]. A null [period] is all time, or a custom range
/// when [customLabel] is set. Drawn as a floating pill so it can stay pinned
/// above scrolling content.
class FinancePeriodBar extends StatelessWidget {
  const FinancePeriodBar({
    required this.period,
    required this.onChanged,
    required this.now,
    this.kinds = financeChartPeriodKinds,
    this.onAllTime,
    this.onCustomRange,
    this.customLabel,
    super.key,
  });

  final FinancePeriod? period;
  final ValueChanged<FinancePeriod> onChanged;
  final DateTime now;
  final List<FinancePeriodKind> kinds;
  final VoidCallback? onAllTime;
  final Future<void> Function()? onCustomRange;
  final String? customLabel;

  static const _allTime = 'all';
  static const _custom = 'custom';

  String _kindLabel(BuildContext context, FinancePeriodKind kind) =>
      switch (kind) {
        FinancePeriodKind.day => context.l10n.financePeriodDay,
        FinancePeriodKind.week => context.l10n.financePeriodWeek,
        FinancePeriodKind.month => context.l10n.financeMonth,
        FinancePeriodKind.year => context.l10n.financePeriodYear,
      };

  String get _selected =>
      customLabel == null ? period?.kind.name ?? _allTime : _custom;

  /// The period a granularity choice lands on: the current period for the
  /// selected granularity, else the one containing the visible start.
  FinancePeriod _target(FinancePeriodKind kind) {
    final period = this.period;
    final anchor = period == null || period.kind == kind || period.contains(now)
        ? now
        : period.start;
    return FinancePeriod.containing(kind, anchor);
  }

  Future<void> _pickKind(BuildContext context) async {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final picked = await showAppChoiceSheet<String>(
      context: context,
      title: l10n.financeBudgetPeriod,
      selected: _selected,
      choices: [
        for (final kind in kinds)
          AppSheetChoice(
            key: ValueKey('finance-period-choice-${kind.name}'),
            value: kind.name,
            label: _kindLabel(context, kind),
            subtitle: _target(kind).label(locale),
            icon: switch (kind) {
              FinancePeriodKind.day => LucideIcons.calendarDays,
              FinancePeriodKind.week => LucideIcons.calendarRange,
              FinancePeriodKind.month => LucideIcons.calendar,
              FinancePeriodKind.year => LucideIcons.calendarFold,
            },
          ),
        if (onCustomRange != null)
          AppSheetChoice(
            key: const ValueKey('finance-period-choice-custom'),
            value: _custom,
            label: l10n.financeCustomDateRange,
            subtitle: customLabel,
            icon: LucideIcons.calendarCog,
          ),
        if (onAllTime != null)
          AppSheetChoice(
            key: const ValueKey('finance-period-choice-all'),
            value: _allTime,
            label: l10n.financeAllTime,
            icon: LucideIcons.infinity,
          ),
      ],
    );
    if (!context.mounted || picked == null) return;
    switch (picked) {
      case _custom:
        await onCustomRange?.call();
      case _allTime:
        if (period != null || customLabel != null) onAllTime?.call();
      default:
        final target = _target(FinancePeriodKind.values.byName(picked));
        if (target != period || customLabel != null) onChanged(target);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final period = this.period;
    final next = period?.shift(1);
    final kind = customLabel != null
        ? l10n.financePeriodCustom
        : period == null
        ? l10n.financeBudgetPeriod
        : _kindLabel(context, period.kind);
    return Container(
      key: const ValueKey('finance-period-bar'),
      height: financePeriodBarExtent(context) - AppSpacing.sm,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: colors.border.withValues(alpha: 0.7)),
        boxShadow: tokens.depth.card,
      ),
      child: Row(
        children: [
          AppIconButton(
            icon: const Icon(LucideIcons.chevronLeft),
            tooltip: l10n.financePreviousPeriod,
            onPressed: period == null
                ? null
                : () => onChanged(period.shift(-1)),
          ),
          Expanded(
            child: Semantics(
              button: true,
              label: l10n.financeBudgetPeriod,
              child: AppControlTarget(
                key: const ValueKey('finance-period-kind'),
                radius: AppRadius.pill,
                onTap: () => unawaited(_pickKind(context)),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      kind,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.xSmall.copyWith(
                        color: colors.mutedForeground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            customLabel ??
                                period?.label(locale) ??
                                l10n.financeAllTime,
                            key: const ValueKey('finance-period-label'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.ui.copyWith(
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.xs),
                        Icon(
                          LucideIcons.chevronDown,
                          size: 16,
                          color: colors.mutedForeground,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          AppIconButton(
            icon: const Icon(LucideIcons.chevronRight),
            tooltip: l10n.financeNextPeriod,
            onPressed: next != null && !next.start.isAfter(now)
                ? () => onChanged(next)
                : null,
          ),
        ],
      ),
    );
  }
}

/// Pins [FinancePeriodBar] (or any child of the same extent) at the top of
/// a scroll view.
class FinancePinnedHeaderDelegate extends SliverPersistentHeaderDelegate {
  const FinancePinnedHeaderDelegate({
    required this.extent,
    required this.child,
  });

  final double extent;
  final Widget child;

  @override
  double get minExtent => extent;

  @override
  double get maxExtent => extent;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
    child: child,
  );

  @override
  bool shouldRebuild(FinancePinnedHeaderDelegate oldDelegate) =>
      oldDelegate.extent != extent || oldDelegate.child != child;
}
