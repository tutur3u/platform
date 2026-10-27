part of 'snapshot.dart';

final class SecurityRegisterEntry {
  const SecurityRegisterEntry({
    required this.product,
    required this.severity,
    required this.status,
    required this.count,
  });

  final Product product;
  final Severity severity;
  final RegisterStatus status;
  final int count;
}

final class SecurityPoint {
  const SecurityPoint({
    required this.t,
    required this.product,
    required this.criticalOpen,
    required this.criticalClosed,
  });

  final DateTime t;
  final Product product;
  final int criticalOpen;
  final int criticalClosed;
}

final class TimeToFixPoint {
  const TimeToFixPoint({
    required this.t,
    required this.product,
    required this.medianHours,
    required this.samples,
  });

  final DateTime t;
  final Product product;
  final double? medianHours;
  final int samples;
}
