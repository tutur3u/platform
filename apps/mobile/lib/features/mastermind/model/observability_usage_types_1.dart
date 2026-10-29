part of 'snapshot.dart';

final class CreditPoint {
  const CreditPoint({
    required this.instance,
    required this.t,
    required this.remaining,
    required this.dailyBurn,
    required this.dailyTarget,
    required this.burnVsTarget,
  });

  final String instance;
  final DateTime t;
  final double? remaining;
  final double? dailyBurn;
  final double? dailyTarget;
  final double? burnVsTarget;
}
