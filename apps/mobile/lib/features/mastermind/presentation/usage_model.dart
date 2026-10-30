import 'dart:math' as math;

import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';

/// One account pool: its latest reading and the series behind its charts.
/// The label is an opaque display string, never mapped to anything.
final class UsagePool {
  const UsagePool({required this.latest, required this.series});

  final UsagePoint latest;

  /// Oldest first.
  final List<UsagePoint> series;

  String get label => latest.instance;

  /// The pool's one pacing verdict: the worse of the windows that report
  /// one, or null when neither does.
  Pacing? get verdict => usageVerdict(latest);

  /// The window the verdict comes from (session on a tie), so the burn line
  /// under the verdict explains that verdict. Null with no verdict.
  UsageWindow? get verdictWindow {
    final verdict = this.verdict;
    if (verdict == null) return null;
    return latest.session.pacing == verdict ? latest.session : latest.weekly;
  }
}

/// The worse of the two windows' pacing, ignoring a window that reports
/// none: SHORT, then OK, then SURPLUS. Null only when neither reports.
Pacing? usageVerdict(UsagePoint latest) {
  final known = [
    for (final pacing in [latest.session.pacing, latest.weekly.pacing])
      if (pacing != null) pacing,
  ];
  if (known.isEmpty) return null;
  return known.reduce((a, b) => _pacingRank(a) <= _pacingRank(b) ? a : b);
}

/// The burn rate worth showing for [window], or null when it is missing or
/// cannot be trusted. A zero burn next to SHORT is a partial hub reading (a
/// pool that burns nothing cannot run short), so it reads as not measured
/// rather than "0 pp/h".
double? usageBurnShown(UsageWindow window) {
  final burn = window.burnPercentPerHour;
  if (burn == null) return null;
  if (window.pacing == Pacing.short && burn <= 0) return null;
  return burn;
}

/// A Codex pool's credit readings, oldest first.
final class CreditPool {
  const CreditPool({required this.label, required this.points});

  final String label;
  final List<CreditPoint> points;

  CreditPoint get latest => points.last;
}

/// What the Insights Usage segment renders, derived once from one accepted
/// snapshot. Pools are never summed or stacked: each keeps its own readings.
final class MastermindUsageModel {
  const MastermindUsageModel._({
    required this.coverage,
    required this.gaps,
    required this.pools,
    required this.credits,
    required this.quotas,
    required this.forecasts,
  });

  factory MastermindUsageModel.from(MastermindSnapshot snapshot) {
    final usage = snapshot.observability.usage;
    final pools = [
      for (final latest in usage.instances)
        UsagePool(
          latest: latest,
          series: [
            for (final point in usage.series)
              if (point.instance == latest.instance) point,
          ]..sort((a, b) => a.t.compareTo(b.t)),
        ),
    ]..sort(_byUrgency);
    final labels = <String>[];
    for (final point in usage.credits) {
      if (!labels.contains(point.instance)) labels.add(point.instance);
    }
    labels.sort();
    final credits = [
      for (final label in labels)
        CreditPool(
          label: label,
          points: [
            for (final point in usage.credits)
              if (point.instance == label) point,
          ]..sort((a, b) => a.t.compareTo(b.t)),
        ),
    ];
    return MastermindUsageModel._(
      coverage: usage.coverage,
      gaps: usage.gaps,
      pools: pools,
      credits: credits,
      quotas: _sorted(snapshot.products.quotas, _byRemaining),
      forecasts: _sorted(
        snapshot.observability.quotaForecasts,
        _bySoonestEmpty,
      ),
    );
  }

  final Coverage coverage;
  final List<UsageGap> gaps;

  /// Most urgent first: SHORT, then unknown pacing, then OK, then SURPLUS,
  /// then the least left, then by label.
  final List<UsagePool> pools;
  final List<CreditPool> credits;

  /// Unreadable first, then least left first.
  final List<ProductQuota> quotas;

  /// Soonest projected empty first, then the pools not projected to run out.
  final List<QuotaForecast> forecasts;

  bool get isEmpty =>
      pools.isEmpty && credits.isEmpty && quotas.isEmpty && forecasts.isEmpty;

  /// Without a source there is nothing to plot, only the coverage to report.
  bool get plottable =>
      coverage != Coverage.missing && coverage != Coverage.unavailable;

  UsagePool? pool(String label) {
    for (final pool in pools) {
      if (pool.label == label) return pool;
    }
    return null;
  }

  CreditPool? creditPool(String label) {
    for (final pool in credits) {
      if (pool.label == label) return pool;
    }
    return null;
  }
}

// List.sort is not stable, so the publisher index breaks ties explicitly.
List<T> _sorted<T>(List<T> items, int Function(T a, T b) compare) {
  final indexed = [for (var i = 0; i < items.length; i++) (i, items[i])]
    ..sort((a, b) {
      final byKey = compare(a.$2, b.$2);
      return byKey != 0 ? byKey : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

int _pacingRank(Pacing? pacing) => switch (pacing) {
  Pacing.short => 0,
  null => 1,
  Pacing.ok => 2,
  Pacing.surplus => 3,
};

// A pool is as urgent as its worse window: a weekly SHORT outranks a session
// that is fine.
int _urgencyRank(UsagePoint latest) => math.min(
  _pacingRank(latest.session.pacing),
  _pacingRank(latest.weekly.pacing),
);

int _byUrgency(UsagePool a, UsagePool b) {
  final byPacing = _urgencyRank(a.latest).compareTo(_urgencyRank(b.latest));
  if (byPacing != 0) return byPacing;
  final byLeft = _nullsLast(
    a.latest.session.remainingPercent,
    b.latest.session.remainingPercent,
  );
  return byLeft != 0 ? byLeft : a.label.compareTo(b.label);
}

int _byRemaining(ProductQuota a, ProductQuota b) {
  final byLeft = a.remainingPercent == null || b.remainingPercent == null
      ? (a.remainingPercent == b.remainingPercent
            ? 0
            : a.remainingPercent == null
            ? -1
            : 1)
      : a.remainingPercent!.compareTo(b.remainingPercent!);
  return byLeft != 0 ? byLeft : a.instance.compareTo(b.instance);
}

int _bySoonestEmpty(QuotaForecast a, QuotaForecast b) {
  final left = a.projectedEmptyAt;
  final right = b.projectedEmptyAt;
  if (left != null && right != null) {
    final byTime = left.compareTo(right);
    return byTime != 0 ? byTime : a.instance.compareTo(b.instance);
  }
  if (left == null && right == null) return a.instance.compareTo(b.instance);
  return left == null ? 1 : -1;
}

int _nullsLast(double? a, double? b) {
  if (a == null || b == null) {
    if (a == b) return 0;
    return a == null ? 1 : -1;
  }
  return a.compareTo(b);
}
