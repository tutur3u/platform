part of 'snapshot.dart';

final class EnvironmentRow implements EventPayload {
  const EnvironmentRow({
    required this.product,
    required this.environment,
    required this.releasedAt,
    required this.ageSeconds,
    required this.versionTag,
    required this.sha,
    required this.commitSubject,
    required this.deployStatus,
    required this.ciState,
    required this.observedAt,
    required this.freshness,
    required this.evidence,
    this.fields = const {},
  });

  final Map<String, HubField> fields;

  final ReleaseProduct product;
  final Environment environment;
  final DateTime? releasedAt;
  final int? ageSeconds;
  final String? versionTag;
  final String? sha;
  final String? commitSubject;
  final DeployStatus deployStatus;
  final CiState ciState;
  final DateTime? observedAt;
  final Freshness freshness;
  final Evidence evidence;
}

final class QuotaPoint {
  const QuotaPoint({
    required this.instance,
    required this.t,
    required this.pct,
  });

  final String instance;
  final DateTime t;
  final double? pct;
}

final class QuotaForecast {
  const QuotaForecast({
    required this.instance,
    required this.projectedEmptyAt,
    required this.resetsAt,
  });

  final String instance;
  final DateTime? projectedEmptyAt;
  final DateTime? resetsAt;
}
