part of 'snapshot.dart';

final class Observability {
  Observability({
    required List<QuotaPoint> quotaSeries,
    required List<QuotaForecast> quotaForecasts,
    required List<SpeedPoint> speedSeries,
    required List<ChildrenPoint> childrenSeries,
    required List<Staff> staff,
    required List<Ci> ci,
    required List<Cadence> cadence,
    required this.usage,
    required this.models,
    required this.fleet,
    required this.coordination,
    required this.delivery,
    required this.security,
  }) : quotaSeries = List.unmodifiable(quotaSeries),
       quotaForecasts = List.unmodifiable(quotaForecasts),
       speedSeries = List.unmodifiable(speedSeries),
       childrenSeries = List.unmodifiable(childrenSeries),
       staff = List.unmodifiable(staff),
       ci = List.unmodifiable(ci),
       cadence = List.unmodifiable(cadence);

  final List<QuotaPoint> quotaSeries;
  final List<QuotaForecast> quotaForecasts;
  final List<SpeedPoint> speedSeries;
  final List<ChildrenPoint> childrenSeries;
  final List<Staff> staff;
  final List<Ci> ci;
  final List<Cadence> cadence;
  final Usage usage;
  final Models models;
  final Fleet fleet;
  final Coordination coordination;
  final Delivery delivery;
  final Security security;
}

final class Source {
  const Source({required this.source, required this.state});

  final SourceName source;
  final SourceState state;
}
