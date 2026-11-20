import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet_interest.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

/// Projected cumulative interest across the selected period as a
/// sparkline. Hidden while amounts are hidden or with fewer than two days.
class WalletInterestProjectionChart extends StatelessWidget {
  const WalletInterestProjectionChart({required this.series, super.key});

  final List<(DateTime, num)> series;

  @override
  Widget build(BuildContext context) {
    if (series.length < 2 || !financeAmountsVisible(context)) {
      return const SizedBox.shrink();
    }
    final label = context.l10n.financeInterestProjectionChart;
    final values = [for (final (_, value) in series) value.toDouble()];
    return Sparkline(
      key: const ValueKey('wallet-interest-projection-chart'),
      height: 56,
      series: ChartSeries(
        id: 'projection',
        label: label,
        slot: 0,
        points: [
          for (final (date, value) in series)
            ChartPoint(t: date, y: value.toDouble()),
        ],
      ),
      summary: label,
      axis: ChartValueAxis.auto(values),
    );
  }
}

/// Deposits that have not started earning interest yet, with the day each
/// one starts.
class WalletInterestPendingDeposits extends StatelessWidget {
  const WalletInterestPendingDeposits({
    required this.deposits,
    required this.currency,
    super.key,
  });

  final List<WalletInterestPendingDeposit> deposits;
  final String currency;

  @override
  Widget build(BuildContext context) {
    if (deposits.isEmpty) return const SizedBox.shrink();
    final l10n = context.l10n;
    final dates = MaterialLocalizations.of(context);
    return Column(
      key: const ValueKey('wallet-interest-pending'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.financeInterestPendingDeposits,
          count: deposits.length,
        ),
        AppGroupedCard(
          children: [
            for (final deposit in deposits)
              AppRichRow(
                title: l10n.financeInterestDepositedOn(
                  dates.formatMediumDate(deposit.depositDate!),
                ),
                subtitle: l10n.financeInterestStartsIn(
                  deposit.daysUntilInterest,
                ),
                leading: const AppIconTile(
                  icon: LucideIcons.hourglass,
                  tone: AppTone.info,
                ),
                trailing: FinanceAmountText(
                  deposit.amount.toDouble(),
                  currency,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
