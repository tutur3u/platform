import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';
import 'package:mobile/features/mastermind/presentation/usage_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// The charts the Usage segment draws. The id in a table location is
/// `<kind>:<pool label>`; it only picks a chart out of the current snapshot.
enum UsageChartKind { budget, credits, burn }

String usageChartId(UsageChartKind kind, String label) => '${kind.name}:$label';

({UsageChartKind kind, String label})? parseUsageChartId(String id) {
  final split = id.indexOf(':');
  if (split <= 0 || split == id.length - 1) return null;
  final kind = UsageChartKind.values.asNameMap()[id.substring(0, split)];
  return kind == null ? null : (kind: kind, label: id.substring(split + 1));
}

/// One chart's data, built once so the panel and its Table page show the same
/// rows.
final class UsageChartSpec {
  const UsageChartSpec({
    required this.id,
    required this.label,
    required this.title,
    required this.summary,
    required this.series,
    required this.axis,
    this.bands = const [],
    this.coverageNote,
    this.formatValue,
  });

  final String id;
  final String label;
  final String title;
  final String summary;
  final List<ChartSeries> series;
  final ChartValueAxis axis;
  final List<ChartBand> bands;
  final String? coverageNote;
  final String Function(double)? formatValue;

  /// Two known points are the least a line needs; fewer is text only.
  bool get plottable =>
      coverageNote == null &&
      series.any((s) => s.points.where((p) => p.y != null).length > 1);

  ChartTableData table(AppLocalizations l10n) => ChartTableData.fromSeries(
    series,
    usageChartLabels(l10n),
    formatValue: formatValue,
  );
}

ChartLabels usageChartLabels(AppLocalizations l10n) => ChartLabels(
  unavailable: l10n.mastermindUnavailable,
  partialBucket: l10n.mastermindPartialBucket,
  table: l10n.mastermindTableLink,
  time: l10n.mastermindColumnTime,
);

/// One decimal at most, no trailing zero.
String usageNumber(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toStringAsFixed(1);

String _percent(AppLocalizations l10n, double? value) => value == null
    ? l10n.mastermindUnavailable
    : l10n.mastermindUnitPercent(value.round().toString());

/// The chart [id] names, or null when the snapshot no longer has it.
UsageChartSpec? usageChartSpec(
  AppLocalizations l10n,
  MastermindUsageModel model,
  String id,
) {
  final parsed = parseUsageChartId(id);
  if (parsed == null) return null;
  final coverage = switch (model.coverage) {
    Coverage.ok => null,
    final other => MastermindLabels.coverage(l10n, other),
  };
  final note = model.plottable ? null : coverage;
  // Partial and stale data still plot; the summary carries the word.
  String prefixed(String summary) =>
      model.plottable && coverage != null ? '$coverage: $summary' : summary;
  switch (parsed.kind) {
    case UsageChartKind.budget:
      final pool = model.pool(parsed.label);
      if (pool == null) return null;
      final latest = pool.latest;
      final first = pool.series.isEmpty ? null : pool.series.first.t;
      final last = pool.series.isEmpty ? null : pool.series.last.t;
      final resets = latest.session.resetsAt;
      final gaps = usageGaps(pool.series, model.gaps);
      return UsageChartSpec(
        id: id,
        label: pool.label,
        title: l10n.mastermindUsageBudgetLeft,
        summary: prefixed(
          [
            pool.label,
            l10n.mastermindSessionLeft(
              _percent(l10n, latest.session.remainingPercent),
            ),
            if (latest.weekly.remainingPercent == null)
              l10n.mastermindSummaryWeeklyNotReported
            else
              l10n.mastermindWeeklyLeft(
                _percent(l10n, latest.weekly.remainingPercent),
              ),
            for (final gap in gaps)
              l10n.mastermindGapSummary(
                Gmt7.time(gap.start, l10n.localeName),
                Gmt7.time(gap.end, l10n.localeName),
                gap.label(l10n),
              ),
          ].join(' · '),
        ),
        coverageNote: note,
        axis: ChartValueAxis.percent,
        formatValue: (value) => l10n.mastermindUnitPercent(usageNumber(value)),
        series: [
          ChartSeries(
            id: 'session',
            label: l10n.mastermindSession,
            slot: 0,
            points: [
              for (final p in pool.series)
                ChartPoint(t: p.t, y: p.session.remainingPercent),
            ],
          ),
          ChartSeries(
            id: 'weekly',
            label: l10n.mastermindWeekly,
            slot: 1,
            style: ChartLineStyle.dashed,
            marker: ChartMarker.square,
            points: [
              for (final p in pool.series)
                ChartPoint(t: p.t, y: p.weekly.remainingPercent),
            ],
          ),
        ],
        // The reset marker only helps when it falls inside what is drawn.
        bands: [
          for (final gap in gaps)
            ChartBand(label: gap.label(l10n), t: gap.start, end: gap.end),
          if (resets != null &&
              first != null &&
              !resets.isBefore(first) &&
              !resets.isAfter(last!))
            ChartBand(
              label: l10n.mastermindResetsAt(
                Gmt7.dateTime(resets, l10n.localeName),
              ),
              t: resets,
            ),
        ],
      );
    case UsageChartKind.credits:
      final pool = model.creditPool(parsed.label);
      if (pool == null) return null;
      final values = [for (final p in pool.points) p.remaining];
      final balance = pool.latest.remaining;
      return UsageChartSpec(
        id: id,
        label: pool.label,
        title: l10n.mastermindChartCreditsBalance,
        summary: prefixed(
          [
            pool.label,
            l10n.mastermindChartCreditsBalance +
                (balance == null
                    ? ': ${l10n.mastermindUnavailable}'
                    : ': ${l10n.mastermindUnitCredits(usageNumber(balance))}'),
            l10n.mastermindSummaryCreditsNote,
          ].join(' · '),
        ),
        coverageNote: note,
        axis: ChartValueAxis.auto(values),
        formatValue: (value) => l10n.mastermindUnitCredits(usageNumber(value)),
        series: [
          ChartSeries(
            id: 'balance',
            label: l10n.mastermindSeriesBalance,
            slot: 0,
            points: [
              for (final p in pool.points) ChartPoint(t: p.t, y: p.remaining),
            ],
          ),
        ],
      );
    case UsageChartKind.burn:
      final pool = model.creditPool(parsed.label);
      if (pool == null) return null;
      final latest = pool.latest;
      String perDay(double? value) => value == null
          ? l10n.mastermindUnavailable
          : l10n.mastermindUnitCreditsPerDay(usageNumber(value));
      return UsageChartSpec(
        id: id,
        label: pool.label,
        title: l10n.mastermindChartCreditsBurn,
        summary: prefixed(
          [
            pool.label,
            '${l10n.mastermindSeriesBurn} ${perDay(latest.dailyBurn)}',
            if (latest.dailyTarget == null)
              l10n.mastermindSummaryCreditsTargetMissing
            else
              '${l10n.mastermindSeriesTarget} ${perDay(latest.dailyTarget)}',
          ].join(' · '),
        ),
        coverageNote: note,
        axis: ChartValueAxis.auto([
          for (final p in pool.points) ...[p.dailyBurn, p.dailyTarget],
        ]),
        formatValue: (value) =>
            l10n.mastermindUnitCreditsPerDay(usageNumber(value)),
        series: [
          ChartSeries(
            id: 'burn',
            label: l10n.mastermindSeriesBurn,
            slot: 1,
            points: [
              for (final p in pool.points) ChartPoint(t: p.t, y: p.dailyBurn),
            ],
          ),
          ChartSeries(
            id: 'target',
            label: l10n.mastermindSeriesTarget,
            slot: 2,
            style: ChartLineStyle.dashed,
            marker: ChartMarker.diamond,
            points: [
              for (final p in pool.points) ChartPoint(t: p.t, y: p.dailyTarget),
            ],
          ),
        ],
      );
  }
}
