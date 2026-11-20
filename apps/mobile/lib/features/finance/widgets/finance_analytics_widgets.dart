import 'package:flutter/material.dart';
import 'package:mobile/core/icons/platform_icon_data.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_analytics.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/widgets/finance_flow_summary.dart';
import 'package:mobile/features/finance/widgets/finance_hue.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_period_bars.dart';
import 'package:mobile/l10n/l10n.dart';

/// Closing balance with the opening balance and net change of the period.
class FinanceBalanceHero extends StatelessWidget {
  const FinanceBalanceHero({
    required this.summary,
    required this.currency,
    super.key,
  });

  final FinanceIncomeExpenseSummary summary;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final change = summary.closingBalance - summary.openingBalance;
    return AppSummaryHero(
      key: const ValueKey('analytics-balance'),
      eyebrow: l10n.financeAnalyticsClosing,
      headline: financeMoney(context, summary.closingBalance, currency),
      icon: LucideIcons.chartLine,
      facts: [
        AppHeroFact(
          label: l10n.financeAnalyticsOpening,
          value: financeMoney(context, summary.openingBalance, currency),
        ),
        AppHeroFact(
          label: l10n.financeAnalyticsNetChange,
          value: financeMoney(context, change, currency, signed: true),
        ),
      ],
    );
  }
}

/// Income, expense and net with one bar pair per interval of [period].
class FinanceAnalyticsFlow extends StatelessWidget {
  const FinanceAnalyticsFlow({
    required this.summary,
    required this.period,
    required this.currency,
    required this.now,
    super.key,
  });

  final FinanceIncomeExpenseSummary summary;
  final FinancePeriod period;
  final String currency;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final income = List<double>.filled(period.bucketCount, 0);
    final expense = List<double>.filled(period.bucketCount, 0);
    for (final point in summary.points) {
      final bucket = period.bucketOf(point.date);
      if (bucket == null || bucket >= income.length) continue;
      income[bucket] += point.income;
      expense[bucket] += point.expense;
    }
    return FinanceFlowSummary(
      income: summary.totalIncome,
      expense: -summary.totalExpense,
      currency: currency,
      chart: FinancePeriodBars(
        income: income,
        expense: expense,
        current: period.bucketOf(now),
      ),
    );
  }
}

/// The balance across the period as a sparkline, with its latest value.
class FinanceBalanceTrendCard extends StatelessWidget {
  const FinanceBalanceTrendCard({
    required this.points,
    required this.currency,
    super.key,
  });

  final List<FinanceBalancePoint> points;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final values = [for (final point in points) point.balance];
    return AppGroupedCard(
      key: const ValueKey('analytics-trend'),
      children: [
        AppRichRow(
          title: l10n.financeAnalyticsBalanceTrend,
          trailing: values.isEmpty
              ? null
              : FinanceAmountText(values.last, currency),
        ),
        if (values.length > 1 && financeAmountsVisible(context))
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.lg,
            ),
            child: Sparkline(
              height: 64,
              series: ChartSeries(
                id: 'balance',
                label: l10n.financeAnalyticsBalanceTrend,
                slot: 0,
                points: [
                  for (final point in points)
                    ChartPoint(t: point.date, y: point.balance),
                ],
              ),
              summary: l10n.financeAnalyticsBalanceTrend,
              axis: ChartValueAxis.auto(
                values,
                signed: values.any((value) => value < 0),
              ),
            ),
          ),
      ],
    );
  }
}

/// Expense or income totals per category with each one's share.
class FinanceCategoryBreakdownCard extends StatelessWidget {
  const FinanceCategoryBreakdownCard({
    required this.totals,
    required this.income,
    required this.currency,
    required this.onIncomeChanged,
    this.loading = false,
    super.key,
  });

  final List<FinanceCategoryTotal> totals;
  final bool income;
  final String currency;
  final ValueChanged<bool> onIncomeChanged;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final sum = totals.fold<double>(0, (sum, total) => sum + total.total);
    final visible = financeAmountsVisible(context);
    return Column(
      key: const ValueKey('analytics-categories'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppSpacing.sm,
      children: [
        AppSectionHeader(title: l10n.financeAnalyticsByCategory),
        AppSegmentedControl<bool>(
          segments: [
            AppSegment(value: false, label: l10n.financeExpense),
            AppSegment(value: true, label: l10n.financeIncome),
          ],
          selected: income,
          onChanged: onIncomeChanged,
        ),
        if (loading)
          const AppSkeletonRows(count: 3)
        else if (totals.isEmpty)
          AppStateMessage.inline(
            icon: LucideIcons.chartPie,
            title: l10n.financeAnalyticsNoCategories,
          )
        else
          AppGroupedCard(
            dividerInset: 64,
            children: [
              for (final total in totals)
                _CategoryShareRow(
                  key: ValueKey('analytics-category-${total.id}'),
                  total: total,
                  share: sum <= 0 ? 0 : total.total / sum,
                  currency: currency,
                  showShare: visible,
                  income: income,
                ),
            ],
          ),
      ],
    );
  }
}

class _CategoryShareRow extends StatelessWidget {
  const _CategoryShareRow({
    required this.total,
    required this.share,
    required this.currency,
    required this.showShare,
    required this.income,
    super.key,
  });

  final FinanceCategoryTotal total;
  final double share;
  final String currency;
  final bool showShare;
  final bool income;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hue = financeCategoryHueName(color: total.color, name: total.name);
    final percent = l10n.financeAnalyticsShare(
      (share * 100).round().toString(),
    );
    return AppRichRow(
      title: total.name ?? l10n.financeReportUncategorized,
      leading: FinanceHueTile(
        icon: resolvePlatformIconData(total.icon) ?? LucideIcons.tag,
        hue: hue,
      ),
      meta: [
        if (showShare)
          SizedBox(
            width: 120,
            child: AppMeter(
              value: share,
              tone: income ? AppTone.success : AppTone.destructive,
              semanticLabel: percent,
            ),
          ),
      ],
      trailing: FinanceAmountText(total.total, currency),
      trailingCaption: showShare ? percent : null,
    );
  }
}
