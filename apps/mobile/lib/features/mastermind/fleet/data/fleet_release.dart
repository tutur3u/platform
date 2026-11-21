part of 'fleet_models.dart';

/// Where an answer to a resolved decision came from.
enum FleetAnswerChannel { mastermind, mobile, whatsapp, cli }

/// A decision closed in the last day. [outcome] is the chosen option's label
/// or outcome, never reply text.
class FleetResolvedDecision {
  const FleetResolvedDecision({
    required this.id,
    required this.title,
    required this.resolvedAt,
    this.kind = FleetDecisionKind.ask,
    this.answeredVia,
    this.outcome,
  });

  static FleetResolvedDecision? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final title = _string(json['title']);
    final resolvedAt = _time(json['resolvedAt']);
    if (id == null || title == null || resolvedAt == null) return null;
    return FleetResolvedDecision(
      id: id,
      title: title,
      resolvedAt: resolvedAt,
      kind:
          _enum(FleetDecisionKind.values, json['kind']) ??
          FleetDecisionKind.ask,
      answeredVia: _enum(FleetAnswerChannel.values, json['answeredVia']),
      outcome: _string(json['outcome']),
    );
  }

  final String id;
  final String title;
  final DateTime resolvedAt;
  final FleetDecisionKind kind;
  final FleetAnswerChannel? answeredVia;
  final String? outcome;
}

enum FleetMainState { open, frozen }

enum FleetProductionState { healthy, degraded, down, unknown }

enum FleetMigrationState { idle, staging, gated, applying, failed }

enum FleetIncidentSeverity { critical, high, medium, low }

class FleetIncident {
  const FleetIncident({
    required this.id,
    required this.title,
    required this.severity,
    required this.openedAt,
  });

  static FleetIncident? parse(Map<String, dynamic> json) {
    final id = _string(json['id']);
    final title = _string(json['title']);
    final severity = _enum(FleetIncidentSeverity.values, json['severity']);
    final openedAt = _time(json['openedAt']);
    if (id == null || title == null || severity == null || openedAt == null) {
      return null;
    }
    return FleetIncident(
      id: id,
      title: title,
      severity: severity,
      openedAt: openedAt,
    );
  }

  final String id;
  final String title;
  final FleetIncidentSeverity severity;
  final DateTime openedAt;
}

/// Release-train status. Only `main` is required; each other part is omitted
/// when absent or unreadable.
class FleetRelease {
  const FleetRelease({
    required this.mainState,
    this.mainReason,
    this.queued,
    this.production,
    this.productionSha,
    this.migrationState,
    this.pendingMigrations = 0,
    this.incidents = const [],
  });

  static FleetRelease? parse(Map<String, dynamic> json) {
    final main = json['main'];
    if (main is! Map<String, dynamic>) return null;
    final mainState = _enum(FleetMainState.values, main['state']);
    if (mainState == null) return null;
    final production = json['production'];
    final migrations = json['migrations'];
    final productionJson = production is Map<String, dynamic>
        ? production
        : const <String, dynamic>{};
    final migrationsJson = migrations is Map<String, dynamic>
        ? migrations
        : const <String, dynamic>{};
    final queued = main['queued'];
    return FleetRelease(
      mainState: mainState,
      mainReason: _string(main['reason']),
      queued: queued is int && queued >= 0 ? queued : null,
      production: _enum(FleetProductionState.values, productionJson['state']),
      productionSha: _string(productionJson['sha']),
      migrationState: _enum(
        FleetMigrationState.values,
        migrationsJson['state'],
      ),
      pendingMigrations: _count(migrationsJson['pending']),
      incidents: _list(json['incidents'], FleetIncident.parse),
    );
  }

  final FleetMainState mainState;
  final String? mainReason;
  final int? queued;
  final FleetProductionState? production;
  final String? productionSha;
  final FleetMigrationState? migrationState;
  final int pendingMigrations;
  final List<FleetIncident> incidents;
}
