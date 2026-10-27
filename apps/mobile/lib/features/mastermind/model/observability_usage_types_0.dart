part of 'snapshot.dart';

final class Usage {
  Usage({
    required this.coverage,
    required List<UsagePoint> instances,
    required List<UsagePoint> series,
    required List<CreditPoint> credits,
  }) : instances = List.unmodifiable(instances),
       series = List.unmodifiable(series),
       credits = List.unmodifiable(credits);

  final Coverage coverage;
  final List<UsagePoint> instances;
  final List<UsagePoint> series;
  final List<CreditPoint> credits;
}

final class UsagePoint {
  const UsagePoint({
    required this.instance,
    required this.displayName,
    required this.t,
    required this.session,
    required this.weekly,
  });

  final String instance;
  final AccountDisplayName displayName;
  final DateTime t;
  final UsageWindow session;
  final UsageWindow weekly;
}

final class UsageWindow {
  const UsageWindow({
    required this.remainingPercent,
    required this.resetsAt,
    required this.burnPercentPerHour,
    required this.projectedRemainingAtReset,
    required this.pacing,
  });

  final double? remainingPercent;
  final DateTime? resetsAt;
  final double? burnPercentPerHour;
  final double? projectedRemainingAtReset;
  final Pacing? pacing;
}
