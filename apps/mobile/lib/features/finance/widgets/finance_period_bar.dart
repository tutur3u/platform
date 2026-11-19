import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/core/ui/overlays/app_action_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/l10n/l10n.dart';

/// Height of [FinancePeriodBar] at the ambient text scale.
double financePeriodBarExtent(BuildContext context) =>
    math.max(52, MediaQuery.textScalerOf(context).scale(22) + 30);

/// Period stepper: previous, the period label, next (disabled past
/// [now]) and a compact Week / Month / Year chooser. Drawn as a floating
/// pill so it can stay pinned above scrolling content.
class FinancePeriodBar extends StatelessWidget {
  const FinancePeriodBar({
    required this.period,
    required this.onChanged,
    required this.now,
    super.key,
  });

  final FinancePeriod period;
  final ValueChanged<FinancePeriod> onChanged;
  final DateTime now;

  String _kindLabel(BuildContext context, FinancePeriodKind kind) =>
      switch (kind) {
        FinancePeriodKind.week => context.l10n.financePeriodWeek,
        FinancePeriodKind.month => context.l10n.financeMonth,
        FinancePeriodKind.year => context.l10n.financePeriodYear,
      };

  Future<void> _pickKind(BuildContext context) async {
    final kind = await showAppChoiceSheet<FinancePeriodKind>(
      context: context,
      title: context.l10n.financeBudgetPeriod,
      selected: period.kind,
      choices: [
        for (final kind in FinancePeriodKind.values)
          AppSheetChoice(value: kind, label: _kindLabel(context, kind)),
      ],
    );
    if (kind == null || kind == period.kind) return;
    // A new length keeps the period that contains the current start.
    final anchor = period.contains(now) ? now : period.start;
    onChanged(FinancePeriod.containing(kind, anchor));
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final next = period.shift(1);
    final canGoNext = !next.start.isAfter(now);
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
            onPressed: () => onChanged(period.shift(-1)),
          ),
          Expanded(
            child: Text(
              period.label(locale),
              key: const ValueKey('finance-period-label'),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.ui.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          AppIconButton(
            icon: const Icon(LucideIcons.chevronRight),
            tooltip: l10n.financeNextPeriod,
            onPressed: canGoNext ? () => onChanged(next) : null,
          ),
          Flexible(
            child: AppFilterButton(
              key: const ValueKey('finance-period-kind'),
              icon: LucideIcons.calendarRange,
              label: _kindLabel(context, period.kind),
              onPressed: () => unawaited(_pickKind(context)),
            ),
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
