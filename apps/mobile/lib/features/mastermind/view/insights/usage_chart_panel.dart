import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_panel.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/usage_charts.dart';
import 'package:mobile/l10n/l10n.dart';

/// The route section every Usage chart table lives under.
const usageSection = 'usage';

/// One Usage chart. The header holds the title and the Table action, so the
/// action is never the last thing in the card (where the floating dock sits).
/// Under it a muted caption says what the plot leaves out (partial coverage,
/// a window not reported, a gap and its reason), then the plot, whose
/// semantics label is the full text summary, then a legend of the lines that
/// are actually drawn and a live readout. With no plot, the summary is shown
/// as text instead, with the coverage note when there is no source.
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
    final tokens = AppTokens.of(context);
    final spec = widget.spec;
    final labels = usageChartLabels(l10n);
    final times = chartSeriesTimes(spec.series);
    final palette = AppChartPalette.of(context);
    final muted = tokens.typography.small.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    final caption = spec.caption;
    final note = spec.coverageNote;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: AppPanel(
        child: DefaultTextStyle.merge(
          style: TextStyle(color: palette.text),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        spec.title,
                        style: tokens.typography.base.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  // The table is its own page, so Back returns to this
                  // scroll position.
                  AppButton.ghost(
                    size: AppButtonSize.small,
                    leading: const Icon(LucideIcons.table),
                    semanticLabel: l10n.mastermindUsageTableFor(
                      '${spec.label} · ${spec.title}',
                    ),
                    onPressed: () => context.push(
                      Routes.mastermindInsightsTablePath(usageSection, spec.id),
                    ),
                    child: Text(l10n.mastermindTableLink),
                  ),
                ],
              ),
              if (spec.plottable) ...[
                if (caption != null) Text(caption, style: muted),
                const SizedBox(height: AppSpacing.sm),
                ChartPlot(
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
                    timeLabel: usageTimeLabel(l10n, times),
                  ),
                ),
                ChartLegend(series: spec.drawnSeries),
                ChartReadout(
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
                ),
              ] else ...[
                Text(spec.summary),
                if (note != null) Text(note, style: muted),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
