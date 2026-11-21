part of 'fleet_models.dart';

/// A page burns the error budget fast enough to need the owner now; a
/// ticket can wait for working hours.
enum FleetAlertSeverity { page, ticket }

enum FleetAlertIndicator { availability, latency }

/// A firing SLO burn alert, served beside the snapshot to clients that
/// declare the `alerts` feature. Burn rates are multiples of the sustainable
/// error-budget spend over the long and short windows.
class FleetAlert {
  const FleetAlert({
    required this.id,
    required this.service,
    required this.severity,
    required this.indicator,
    required this.burnLong,
    required this.burnShort,
    required this.startedAt,
  });

  static FleetAlert? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final service = _string(json['service']);
    final severity = _enum(FleetAlertSeverity.values, json['severity']);
    final indicator = _enum(FleetAlertIndicator.values, json['indicator']);
    final burnLong = json['burnLong'];
    final burnShort = json['burnShort'];
    final startedAt = _time(json['startedAt']);
    if (id == null ||
        service == null ||
        severity == null ||
        indicator == null ||
        burnLong is! num ||
        burnShort is! num ||
        startedAt == null) {
      return null;
    }
    return FleetAlert(
      id: id,
      service: service,
      severity: severity,
      indicator: indicator,
      burnLong: burnLong.toDouble(),
      burnShort: burnShort.toDouble(),
      startedAt: startedAt,
    );
  }

  final String id;
  final String service;
  final FleetAlertSeverity severity;
  final FleetAlertIndicator indicator;
  final double burnLong;
  final double burnShort;
  final DateTime startedAt;
}
