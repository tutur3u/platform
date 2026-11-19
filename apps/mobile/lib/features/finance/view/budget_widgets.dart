import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/icons/platform_icon_data.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/features/finance/utils/budget_pace.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whole percent of [progress], for budget captions.
String budgetPercent(double progress) => '${(progress * 100).round()}%';

/// Tone and label of a budget's [health].
(AppTone, String) budgetHealthLabel(
  BuildContext context,
  FinanceBudgetHealth health,
) => switch (health) {
  FinanceBudgetHealth.onTrack => (
    AppTone.success,
    context.l10n.financeBudgetOnTrack,
  ),
  FinanceBudgetHealth.nearLimit => (
    AppTone.warning,
    context.l10n.financeBudgetNearLimit,
  ),
  FinanceBudgetHealth.over => (
    AppTone.destructive,
    context.l10n.financeBudgetOverLabel,
  ),
};

/// Hue of a budget's category, blue without one.
String budgetHueName(TransactionCategory? category) => category == null
    ? 'blue'
    : financeCategoryHueName(color: category.color, name: category.name);

/// Static rounded bar filled to [value] (0-1) in [color]. The fill hides
/// while amounts are hidden.
class FinanceMeter extends StatelessWidget {
  const FinanceMeter({
    required this.value,
    required this.color,
    this.height = 6,
    super.key,
  });

  final double value;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final track = context.tokens.colorScheme.muted;
    final visible = financeAmountsVisible(context);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: SizedBox(
          height: height,
          child: Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: track),
              if (visible)
                FractionallySizedBox(
                  alignment: AlignmentDirectional.centerStart,
                  widthFactor: value.clamp(0, 1).toDouble(),
                  child: ColoredBox(color: color),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small tone label such as "On track".
class BudgetHealthChip extends StatelessWidget {
  const BudgetHealthChip({required this.health, super.key});

  final FinanceBudgetHealth health;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (tone, label) = budgetHealthLabel(context, health);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.fill(tokens.colorScheme),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.caption.copyWith(
            color: tone.foreground(tokens.colorScheme),
          ),
        ),
      ),
    );
  }
}

/// Spent against the combined limit of eligible monthly budgets, what is
/// left per remaining day and the days left in the month.
class BudgetSummaryCard extends StatelessWidget {
  const BudgetSummaryCard({
    required this.spent,
    required this.limit,
    required this.currency,
    required this.month,
    super.key,
  });

  final double spent;
  final double limit;
  final String currency;
  final DateTime month;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final progress = limit <= 0 ? 0.0 : spent / limit;
    final remaining = limit - spent;
    final daysLeft = daysLeftUntil(
      DateTime(month.year, month.month + 1, 0),
      month,
    );
    final locale = Localizations.localeOf(context).toString();
    final muted = tokens.typography.caption.copyWith(
      color: colors.mutedForeground,
    );
    final perDay = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : null;
    return AppCard(
      key: const ValueKey('finance-budget-summary'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: AppSpacing.sm,
            children: [
              Expanded(
                child: Text(
                  DateFormat.yMMMM(locale).format(month),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.uiSm.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
              Text(l10n.financeBudgetDaysLeft(daysLeft), style: muted),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: FinanceMaskedText(
              context,
              remaining < 0
                  ? l10n.financeBudgetOver(
                      financeMoney(context, -remaining, currency),
                    )
                  : l10n.financeBudgetLeft(
                      financeMoney(context, remaining, currency),
                    ),
              maxLines: 1,
              style: tokens.typography.numeric.copyWith(
                fontSize: 24,
                height: 30 / 24,
                fontWeight: FontWeight.w700,
                color: remaining < 0 ? colors.destructive : colors.foreground,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          FinanceMeter(
            value: progress,
            height: 8,
            color: progress > 1 ? colors.destructive : colors.primary,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            spacing: AppSpacing.sm,
            children: [
              Expanded(
                child: FinanceMaskedText(
                  context,
                  l10n.financeBudgetOfLimit(
                    financeMoney(context, limit, currency),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: muted,
                ),
              ),
              if (perDay != null)
                Expanded(
                  child: FinanceMaskedText(
                    context,
                    l10n.financeBudgetPerDay(
                      financeMoney(context, perDay, currency),
                    ),
                    key: const ValueKey('finance-budget-summary-per-day'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                    style: muted.copyWith(color: colors.foreground),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One budget: category hue tile, name, spent, a meter in the category hue
/// (destructive once over), its health, and what is left in total and per
/// remaining day.
class BudgetCard extends StatelessWidget {
  const BudgetCard({
    required this.budget,
    required this.currency,
    required this.onTap,
    required this.now,
    this.category,
    this.pending = false,
    super.key,
  });

  final FinanceBudget budget;
  final TransactionCategory? category;
  final String currency;
  final bool pending;
  final DateTime now;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final hueName = budgetHueName(category);
    final hue = financeHue(context, hueName);
    final over = budget.health == FinanceBudgetHealth.over;
    final muted = tokens.typography.caption.copyWith(
      color: colors.mutedForeground,
    );
    final remaining = budget.remaining.abs();
    final perDay = budgetPerDay(budget, now);
    final left = over
        ? l10n.financeBudgetOver(financeMoney(context, remaining, currency))
        : l10n.financeBudgetLeft(financeMoney(context, remaining, currency));
    return AppCard(
      key: ValueKey('finance-budget-${budget.id}'),
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md + 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: AppSpacing.md,
            children: [
              FinanceHueTile(
                icon:
                    resolvePlatformIconData(category?.icon) ??
                    LucideIcons.target,
                hue: hueName,
              ),
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      budget.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.ui,
                    ),
                    FinanceMaskedText(
                      context,
                      pending
                          ? l10n.offlineEditQueued
                          : l10n.financeBudgetOfLimit(
                              financeMoney(context, budget.amount, currency),
                            ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: muted,
                    ),
                  ],
                ),
              ),
              Flexible(
                flex: 2,
                child: Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: FinanceAmountText(
                      budget.spent,
                      currency,
                      style: tokens.typography.numeric.copyWith(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          FinanceMeter(
            value: budget.progress,
            color: over ? colors.destructive : hue.ink,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            spacing: AppSpacing.sm,
            children: [
              BudgetHealthChip(health: budget.health),
              Expanded(
                child: FinanceMaskedText(
                  context,
                  [
                    left,
                    if (perDay != null)
                      l10n.financeBudgetPerDay(
                        financeMoney(context, perDay, currency),
                      ),
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: muted.copyWith(
                    color: over ? colors.destructive : null,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
