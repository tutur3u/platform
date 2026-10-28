import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/features/mastermind/view/insights/pacing_glyph.dart';
import 'package:mobile/features/mastermind/view/insights/usage_chart_panel.dart';
import 'package:mobile/l10n/l10n.dart';

/// One account pool: the session and weekly budget with their pacing, reset,
/// burn and projection, then the pool's own chart. Never stacked or summed
/// with another pool. The label is shown verbatim.
class UsagePoolCard extends StatelessWidget {
  const UsagePoolCard({required this.pool, required this.chart, super.key});

  final UsagePool pool;
  final UsageChartSpec? chart;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: pool.label,
          children: [
            ..._window(
              context,
              l10n.mastermindChartSessionRemaining,
              pool.latest.session,
            ),
            ..._window(
              context,
              l10n.mastermindChartWeeklyRemaining,
              pool.latest.weekly,
            ),
          ],
        ),
        if (chart != null) UsageChartPanel(spec: chart!),
      ],
    );
  }

  static List<Widget> _window(
    BuildContext context,
    String title,
    UsageWindow window,
  ) {
    final l10n = context.l10n;
    final remaining = window.remainingPercent;
    final resets = window.resetsAt;
    final burn = window.burnPercentPerHour;
    final projected = window.projectedRemainingAtReset;
    final perHour = burn == null
        ? ''
        : l10n.mastermindUnitPpPerHour(usageNumber(burn));
    final pp = projected == null
        ? ''
        : l10n.mastermindUnitPp(_signed(projected));
    return [
      AppGroupedRow(
        title: Text(title),
        subtitle: resets == null
            ? null
            : Text(
                l10n.mastermindResetsAt(Gmt7.dateTime(resets, l10n.localeName)),
              ),
        // A null reading is "Unavailable", never a zero.
        trailing: Text(
          remaining == null
              ? l10n.mastermindUnavailable
              : l10n.mastermindUnitPercent(usageNumber(remaining)),
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
      AppGroupedRow(
        title: Text(l10n.mastermindUsagePacing),
        subtitle: burn == null && projected == null
            ? null
            : Text(
                [
                  if (burn != null) _line(l10n.mastermindChartBurn, perHour),
                  if (projected != null)
                    _line(l10n.mastermindChartProjection, pp),
                ].join(' · '),
              ),
        trailing: PacingGlyph(pacing: window.pacing),
      ),
    ];
  }

  static String _line(String label, String value) => '$label $value';

  static String _signed(double value) =>
      '${value >= 0 ? '+' : ''}${usageNumber(value)}';
}
