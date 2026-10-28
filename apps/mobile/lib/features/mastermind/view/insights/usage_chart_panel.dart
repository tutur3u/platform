import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/l10n/l10n.dart';

/// The route section every Usage chart table lives under.
const usageSection = 'usage';

/// One Usage chart: summary first (the text equivalent of the plot), the
/// shape legend, a live readout and the Table action. With no source behind
/// it the plot is left out and the coverage note stands in for it.
class UsageChartPanel extends StatefulWidget {
  const UsageChartPanel({required this.spec, super.key});

  final UsageChartSpec spec;

  @override
  State<UsageChartPanel> createState() => _UsageChartPanelState();
}

class _UsageChartPanelState extends State<UsageChartPanel> {
  final _selection = ChartSelectionController();

  @override
  void dispose() {
    _selection.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final spec = widget.spec;
    final labels = usageChartLabels(l10n);
    final times = chartSeriesTimes(spec.series);
    final palette = AppChartPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: ChartPanel(
        summary: spec.summary,
        coverageNote: spec.coverageNote,
        series: spec.series,
        table: spec.table(l10n),
        tableLabel: l10n.mastermindTableLink,
        // The table is its own page, so Back returns to this scroll position.
        onTable: (_) => context.push(
          Routes.mastermindInsightsTablePath(usageSection, spec.id),
        ),
        plot: spec.plottable
            ? ChartPlot(
                controller: _selection,
                bucketCount: times.length,
                seriesCount: spec.series.length,
                summary: spec.summary,
                height: 160,
                painterBuilder: (selection) => LinePainter(
                  series: spec.series,
                  palette: palette,
                  axis: spec.axis,
                  bands: spec.bands,
                  selectedBucket: selection?.bucket,
                  selectedSeries: selection?.series ?? 0,
                  textScaler: MediaQuery.textScalerOf(context),
                ),
              )
            : null,
        readout: spec.plottable
            ? ChartReadout(
                controller: _selection,
                readout: (selection) {
                  final series = spec.series[selection.series];
                  final t = times[selection.bucket];
                  final point = series.points
                      .where((p) => p.t == t)
                      .firstOrNull;
                  return chartPointReadout(
                    point ?? ChartPoint(t: t, y: null),
                    series,
                    labels,
                    last: false,
                    formatValue: spec.formatValue,
                  );
                },
              )
            : null,
      ),
    );
  }
}
