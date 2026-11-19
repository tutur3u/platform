import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/widgets/finance_flow_summary.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_period_bar.dart';
import 'package:mobile/features/finance/widgets/finance_period_bars.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/finance_transaction_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// Scrolling content of the wallet page below the shell top bar. Null
/// [transactions] mean the period is still loading: its summary and rows
/// show skeletons while the [hero] stays.
class WalletDetailBody extends StatelessWidget {
  const WalletDetailBody({
    required this.controller,
    required this.hero,
    required this.period,
    required this.now,
    required this.onPeriodChanged,
    required this.currency,
    required this.stats,
    required this.transactions,
    required this.complete,
    required this.loadingMore,
    required this.onRetry,
    required this.onTransactionTap,
    required this.onCreate,
    this.error,
    super.key,
  });

  final ScrollController controller;
  final Widget hero;
  final FinancePeriod period;
  final DateTime now;
  final ValueChanged<FinancePeriod> onPeriodChanged;

  /// The wallet's currency, used for its totals and rows.
  final String currency;
  final TransactionStats? stats;
  final List<Transaction>? transactions;

  /// Whether every row of the period is loaded, which the chart needs.
  final bool complete;
  final bool loadingMore;
  final String? error;
  final VoidCallback onRetry;
  final ValueChanged<Transaction> onTransactionTap;
  final VoidCallback? onCreate;

  @override
  Widget build(BuildContext context) {
    final rows = transactions;
    final groups = rows == null
        ? const <FinanceDayGroup>[]
        : groupTransactionsByDay(rows);
    return AppPageScrollView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(child: hero),
        const SliverToBoxAdapter(child: SizedBox(height: AppLayout.itemGap)),
        SliverPersistentHeader(
          pinned: true,
          delegate: FinancePinnedHeaderDelegate(
            extent: financePeriodBarExtent(context),
            child: FinancePeriodBar(
              period: period,
              now: now,
              onChanged: onPeriodChanged,
            ),
          ),
        ),
        SliverToBoxAdapter(child: _summary(context, rows)),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        if (rows == null)
          SliverToBoxAdapter(
            child: error == null
                ? const AppSkeletonRows(count: 4)
                : AppStateMessage(
                    icon: Icons.error_outline_rounded,
                    title: context.l10n.commonSomethingWentWrong,
                    message: error,
                    tone: AppTone.destructive,
                    actionLabel: context.l10n.commonRetry,
                    onAction: onRetry,
                  ),
          )
        else if (groups.isEmpty)
          SliverToBoxAdapter(child: _empty(context))
        else
          SliverList.builder(
            itemCount: groups.length + (loadingMore ? 1 : 0),
            itemBuilder: (context, index) => index == groups.length
                ? const Padding(
                    padding: EdgeInsets.only(top: AppSpacing.md),
                    child: AppSkeletonRows(),
                  )
                : _DayGroup(
                    group: groups[index],
                    currency: currency,
                    now: now,
                    onTap: onTransactionTap,
                  ),
          ),
      ],
    );
  }

  Widget _summary(BuildContext context, List<Transaction>? rows) {
    if (rows == null) return const FinanceSkeleton(height: 128);
    final buckets = financePeriodBuckets(period, rows);
    final stats = this.stats;
    final income =
        stats?.totalIncome ?? buckets.income.fold<double>(0, (a, b) => a + b);
    final expense = stats != null
        ? -stats.totalExpense.abs()
        : -buckets.expense.fold<double>(0, (a, b) => a + b);
    return FinanceFlowSummary(
      key: const ValueKey('finance-wallet-flow'),
      income: income,
      expense: expense,
      currency: currency,
      // The chart would reveal relative sizes, so it hides with amounts.
      chart: complete && rows.isNotEmpty && financeAmountsVisible(context)
          ? FinancePeriodBars(
              income: buckets.income,
              expense: buckets.expense,
              current: period.bucketOf(now),
            )
          : null,
    );
  }

  Widget _empty(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: AppStateMessage(
        key: const ValueKey('finance-wallet-empty'),
        icon: LucideIcons.receipt,
        illustration: const AppIllustration(AppIllustrationKind.noTransactions),
        title: l10n.financeNoTransactionsInPeriod(period.label(locale)),
        actionLabel: onCreate == null ? null : l10n.financeCreateTransaction,
        onAction: onCreate,
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  const _DayGroup({
    required this.group,
    required this.currency,
    required this.now,
    required this.onTap,
  });

  final FinanceDayGroup group;
  final String currency;
  final DateTime now;
  final ValueChanged<Transaction> onTap;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FinanceDayHeader(group: group, fallbackCurrency: currency, now: now),
      AppGroupedCard(
        dividerInset: 64,
        children: [
          for (final transaction in group.transactions)
            FinanceTransactionRow(
              transaction: transaction,
              fallbackCurrency: currency,
              onTap: () => onTap(transaction),
            ),
        ],
      ),
    ],
  );
}
