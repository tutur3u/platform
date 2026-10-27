part of 'snapshot.dart';

final class Models {
  Models({
    required this.coverage,
    required this.observedAt,
    required List<ModelBreakdown> breakdown,
    required List<ModelPoint> series,
  }) : breakdown = List.unmodifiable(breakdown),
       series = List.unmodifiable(series);

  final Coverage coverage;
  final DateTime? observedAt;
  final List<ModelBreakdown> breakdown;
  final List<ModelPoint> series;
}

final class ModelBreakdown {
  const ModelBreakdown({
    required this.model,
    required this.role,
    required this.effort,
    required this.runs,
    required this.active,
    required this.completed,
    required this.terminal,
    required this.success,
    required this.rework,
    required this.successRate,
    required this.reworkRate,
    required this.medianDurationSeconds,
    required this.tokensPerSuccess,
    required this.sessionPercentPerSuccess,
    required this.tokensMeasuredRuns,
    required this.sessionMeasuredRuns,
    required this.successRateChange7d,
    required this.tentative,
  });

  final ModelFamily model;
  final RunRole role;
  final Effort effort;
  final int runs;
  final int active;
  final int completed;
  final int terminal;
  final int success;
  final int rework;
  final double? successRate;
  final double? reworkRate;
  final double? medianDurationSeconds;
  final double? tokensPerSuccess;
  final double? sessionPercentPerSuccess;
  final int tokensMeasuredRuns;
  final int sessionMeasuredRuns;
  final double? successRateChange7d;
  final bool tentative;
}

final class ModelPoint {
  const ModelPoint({
    required this.t,
    required this.model,
    required this.role,
    required this.effort,
    required this.runs,
    required this.active,
    required this.completed,
    required this.terminal,
    required this.success,
    required this.rework,
    required this.successRate,
    required this.reworkRate,
    required this.medianDurationSeconds,
    required this.tokensPerSuccess,
    required this.sessionPercentPerSuccess,
    required this.tokensMeasuredRuns,
    required this.sessionMeasuredRuns,
    required this.successRateChange7d,
    required this.tentative,
  });

  final DateTime t;
  final ModelFamily model;
  final RunRole role;
  final Effort effort;
  final int runs;
  final int active;
  final int completed;
  final int terminal;
  final int success;
  final int rework;
  final double? successRate;
  final double? reworkRate;
  final double? medianDurationSeconds;
  final double? tokensPerSuccess;
  final double? sessionPercentPerSuccess;
  final int tokensMeasuredRuns;
  final int sessionMeasuredRuns;
  final double? successRateChange7d;
  final bool tentative;
}
