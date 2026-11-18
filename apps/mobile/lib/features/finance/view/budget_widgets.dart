import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/icons/platform_icon_data.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whole percent of [progress], for budget captions.
String budgetPercent(double progress) => '${(progress * 100).round()}%';

/// Static rounded bar filled to [value] (0-1) in [color].
class FinanceMeter extends StatelessWidget {
  const FinanceMeter({required this.value, required this.color, super.key});

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final track = context.tokens.colorScheme.muted;
    final visible = financeAmountsVisible(context);
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          height: 6,
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

/// Spent against the combined limit of eligible monthly budgets.
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
    final lastDay = DateTime(month.year, month.month + 1, 0);
    final daysLeft = lastDay
        .difference(DateTime(month.year, month.month, month.day))
        .inDays;
    final locale = Localizations.localeOf(context).toString();
    final muted = tokens.typography.caption.copyWith(
      color: colors.mutedForeground,
      fontWeight: FontWeight.w600,
    );
    return AppCard(
      key: const ValueKey('finance-budget-summary'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            DateFormat.yMMMM(locale).format(month),
            style: tokens.typography.uiSm.copyWith(
              color: colors.mutedForeground,
            ),
          ),
          Text(l10n.financeMonthlyBudgetScope(currency), style: muted),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            spacing: 8,
            children: [
              Flexible(
                child: FinanceAmountText(
                  spent,
                  currency,
                  style: tokens.typography.numeric.copyWith(
                    fontSize: 24,
                    height: 30 / 24,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              FinanceMaskedText(
                context,
                l10n.financeBudgetOfLimit(
                  financeMoney(context, limit, currency),
                ),
                style: muted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          FinanceMeter(
            value: progress,
            color: progress > 1 ? colors.destructive : colors.info,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: FinanceMaskedText(
                  context,
                  maskFinanceValue(
                    budgetPercent(progress),
                    showAmounts: financeAmountsVisible(context),
                  ),
                  style: muted,
                ),
              ),
              Text(l10n.financeBudgetDaysLeft(daysLeft), style: muted),
            ],
          ),
        ],
      ),
    );
  }
}

/// One budget: category hue tile, name, limit, spent, a meter in the
/// category hue (destructive once over) and what is left or over.
class BudgetCard extends StatelessWidget {
  const BudgetCard({
    required this.budget,
    required this.currency,
    required this.onTap,
    this.category,
    this.pending = false,
    super.key,
  });

  final FinanceBudget budget;
  final TransactionCategory? category;
  final String currency;
  final bool pending;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final hueName = category == null
        ? 'blue'
        : financeCategoryHueName(color: category!.color, name: category!.name);
    final hue = financeHue(context, hueName);
    final health = budget.health;
    final over = health == FinanceBudgetHealth.over;
    final muted = tokens.typography.caption.copyWith(
      color: colors.mutedForeground,
      fontWeight: FontWeight.w600,
    );
    final remaining = budget.remaining.abs();
    return AppCard(
      key: ValueKey('finance-budget-${budget.id}'),
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: 12,
            children: [
              FinanceHueTile(
                icon:
                    resolvePlatformIconData(category?.icon) ??
                    LucideIcons.target,
                hue: hueName,
              ),
              Expanded(
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
                      style: tokens.typography.bodySm.copyWith(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              FinanceAmountText(
                budget.spent,
                currency,
                style: tokens.typography.numeric.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FinanceMeter(
            value: budget.progress,
            color: over ? colors.destructive : hue.ink,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: FinanceMaskedText(
                  context,
                  maskFinanceValue(
                    budgetPercent(budget.progress),
                    showAmounts: financeAmountsVisible(context),
                  ),
                  style: muted,
                ),
              ),
              FinanceMaskedText(
                context,
                over
                    ? l10n.financeBudgetOver(
                        financeMoney(context, remaining, currency),
                      )
                    : l10n.financeBudgetLeft(
                        financeMoney(context, remaining, currency),
                      ),
                style: muted.copyWith(color: over ? colors.destructive : null),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
