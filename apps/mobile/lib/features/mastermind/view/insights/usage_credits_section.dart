import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/insights/usage_chart_panel.dart';
import 'package:mobile/l10n/l10n.dart';

/// A Codex pool's credits: the latest balance, burn and target, then the
/// balance line and the burn against target. Credits are a unit of their own,
/// never money or tokens.
class UsageCreditsSection extends StatelessWidget {
  const UsageCreditsSection({
    required this.pool,
    required this.balance,
    required this.burn,
    super.key,
  });

  final CreditPool pool;
  final UsageChartSpec? balance;
  final UsageChartSpec? burn;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final latest = pool.latest;
    String credits(double? value) => value == null
        ? l10n.mastermindUnavailable
        : l10n.mastermindUnitCredits(usageNumber(value));
    String perDay(double? value) => value == null
        ? l10n.mastermindUnavailable
        : l10n.mastermindUnitCreditsPerDay(usageNumber(value));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: '${pool.label} · ${l10n.mastermindUsageCreditsTitle}',
          footer: l10n.mastermindSummaryCreditsNote,
          children: [
            AppGroupedRow(
              title: Text(l10n.mastermindChartCreditsBalance),
              trailing: Text(credits(latest.remaining)),
            ),
            AppGroupedRow(
              title: Text(l10n.mastermindSeriesBurn),
              trailing: Text(perDay(latest.dailyBurn)),
            ),
            AppGroupedRow(
              title: Text(l10n.mastermindSeriesTarget),
              trailing: Text(
                latest.dailyTarget == null
                    ? l10n.mastermindUsageTargetUnavailable
                    : perDay(latest.dailyTarget),
              ),
            ),
          ],
        ),
        if (balance != null) UsageChartPanel(spec: balance!),
        if (burn != null) UsageChartPanel(spec: burn!),
      ],
    );
  }
}
