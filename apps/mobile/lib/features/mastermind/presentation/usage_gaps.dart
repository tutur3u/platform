import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/l10n/l10n.dart';

final class UsageGap {
  const UsageGap(this.start, this.end, this.reason);
  final DateTime start;
  final DateTime end;
  final String reason;

  static UsageGap? parse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final start = DateTime.tryParse('${raw['start']}');
    final end = DateTime.tryParse('${raw['end']}');
    if (start == null || end == null || !end.isAfter(start)) return null;
    return UsageGap(start, end, '${raw['reason']}');
  }

  String label(AppLocalizations l10n) => switch (reason) {
    'source_down' => l10n.mastermindSourceDown,
    'account_switch' => l10n.mastermindGapAccountSwitch,
    'reset' => l10n.mastermindGapReset,
    _ => l10n.mastermindGapNoSamples,
  };
}

List<UsageGap> usageGaps(List<UsagePoint> samples, List<UsageGap> published) {
  if (samples.length < 2) return const [];
  final first = samples.first.t;
  final last = samples.last.t;
  final result = [
    for (final gap in published)
      if (gap.end.isAfter(first) && gap.start.isBefore(last)) gap,
  ];
  final points = [for (final sample in samples) ChartPoint(t: sample.t, y: 0)];
  for (var i = 1; i < samples.length; i++) {
    if (!chartHasGap(points, i)) continue;
    final start = samples[i - 1].t;
    final end = samples[i].t;
    if (result.any((g) => g.start.isBefore(end) && g.end.isAfter(start))) {
      continue;
    }
    final reset = samples[i - 1].session.resetsAt;
    result.add(
      UsageGap(
        start,
        end,
        reset != null && reset.isAfter(start) && !reset.isAfter(end)
            ? 'reset'
            : 'no_samples',
      ),
    );
  }
  return result;
}
