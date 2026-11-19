import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/kit/app_key_value_row.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/utils/budget_pace.dart';
import 'package:mobile/features/finance/view/budget_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens [budget]'s details; resolves true when the person chose Edit.
Future<bool> showBudgetDetailSheet(
  BuildContext context, {
  required FinanceBudget budget,
  required String currency,
  required DateTime now,
  required bool canEdit,
  TransactionCategory? category,
  Wallet? wallet,
}) async =>
    await showAppSheet<bool>(
      context: context,
      builder: (sheetContext) => BudgetDetailSheet(
        budget: budget,
        currency: currency,
        now: now,
        category: category,
        wallet: wallet,
        onEdit: canEdit ? () => Navigator.of(sheetContext).pop(true) : null,
      ),
    ) ??
    false;

/// A budget's progress: spent against the limit, its health, what is left
/// in total and per remaining day, the period and what it covers.
class BudgetDetailSheet extends StatelessWidget {
  const BudgetDetailSheet({
    required this.budget,
    required this.currency,
    required this.now,
    this.category,
    this.wallet,
    this.onEdit,
    super.key,
  });

  final FinanceBudget budget;
  final String currency;
  final DateTime now;
  final TransactionCategory? category;
  final Wallet? wallet;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final over = budget.health == FinanceBudgetHealth.over;
    final hue = financeHue(context, budgetHueName(category));
    final perDay = budgetPerDay(budget, now);
    final start = budgetPeriodStart(budget, now);
    final end = budgetPeriodEnd(budget, now);
    final dates = DateFormat.yMMMd(locale);
    final periodName = switch (budget.period) {
      FinanceBudgetPeriod.monthly => l10n.financeBudgetMonthly,
      FinanceBudgetPeriod.yearly => l10n.financeBudgetYearly,
      FinanceBudgetPeriod.custom => l10n.financeBudgetCustom,
    };
    final description = budget.description?.trim() ?? '';
    return AppSheetScaffold(
      title: budget.name,
      actions: [
        if (onEdit != null)
          AppButton.primary(
            key: const ValueKey('finance-budget-detail-edit'),
            onPressed: onEdit,
            child: Text(l10n.financeEditBudget),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            spacing: AppSpacing.sm,
            children: [
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: FinanceAmountText(
                    budget.spent,
                    currency,
                    style: tokens.typography.numeric.copyWith(
                      fontSize: 28,
                      height: 34 / 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              Flexible(
                child: FinanceMaskedText(
                  context,
                  l10n.financeBudgetOfLimit(
                    financeMoney(context, budget.amount, currency),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.uiSm.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          FinanceMeter(
            value: budget.progress,
            height: 10,
            color: over ? colors.destructive : hue.ink,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              BudgetHealthChip(health: budget.health),
              const Spacer(),
              FinanceMaskedText(
                context,
                maskFinanceValue(
                  budgetPercent(budget.progress),
                  showAmounts: financeAmountsVisible(context),
                ),
                style: tokens.typography.caption.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _FactsGrid(
            facts: [
              (
                over
                    ? l10n.financeBudgetOverLabel
                    : l10n.financeBudgetRemaining,
                financeMoney(context, budget.remaining.abs(), currency),
              ),
              (
                l10n.financeBudgetPerDayLabel,
                perDay == null ? '—' : financeMoney(context, perDay, currency),
              ),
              (
                l10n.financeBudgetSpent,
                financeMoney(context, budget.spent, currency),
              ),
              (
                periodName,
                l10n.financeBudgetDaysLeft(budgetDaysLeft(budget, now)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppKeyValueRow(
            label: l10n.financeBudgetPeriod,
            value: '${dates.format(start)} – ${dates.format(end)}',
          ),
          if (category?.name case final name?)
            AppKeyValueRow(label: l10n.financeCategory, value: name),
          if (wallet?.name case final name?)
            AppKeyValueRow(label: l10n.financeWallet, value: name),
          if (description.isNotEmpty)
            AppKeyValueRow(label: l10n.financeDescription, value: description),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}

/// Two-column grid of label and value pairs. Labels stay on one line and
/// values scale down rather than clip.
class _FactsGrid extends StatelessWidget {
  const _FactsGrid({required this.facts});

  final List<(String, String)> facts;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final rows = <Widget>[];
    for (var i = 0; i < facts.length; i += 2) {
      rows.add(
        Row(
          spacing: AppSpacing.sm,
          children: [
            for (final fact in facts.skip(i).take(2))
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.muted.withValues(alpha: 0.6),
                    borderRadius: tokens.borderRadiusLg,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: AppSpacing.xxs,
                    children: [
                      Text(
                        fact.$1,
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.caption.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: AlignmentDirectional.centerStart,
                        child: FinanceMaskedText(
                          context,
                          fact.$2,
                          maxLines: 1,
                          style: tokens.typography.numeric.copyWith(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
    }
    return Column(spacing: AppSpacing.sm, children: rows);
  }
}
