part of 'fleet_models.dart';

/// How a lane that no longer counts as failed ended: a later run recovered
/// it ([quotaRecovered] when it resumed after a usage limit), or it was
/// cancelled, interrupted or duplicated by a later attempt. Such lanes are
/// idle.
enum FleetLaneResolution { recovered, quotaRecovered, cancelled }

/// Lane counts by state. [failed] holds only terminal failures nobody picked
/// up again; [recovered], [quotaRecovered] and [cancelled] are part of
/// [idle] and read as zero when Web leaves them out.
class FleetCounts {
  const FleetCounts({
    this.running = 0,
    this.waiting = 0,
    this.queued = 0,
    this.idle = 0,
    this.failed = 0,
    this.recovered = 0,
    this.quotaRecovered = 0,
    this.cancelled = 0,
  });

  factory FleetCounts.parse(Object? raw) {
    final json = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
    return FleetCounts(
      running: _count(json['running']),
      waiting: _count(json['waiting']),
      queued: _count(json['queued']),
      idle: _count(json['idle']),
      failed: _count(json['failed']),
      recovered: _count(json['recovered']),
      quotaRecovered: _count(json['quotaRecovered']),
      cancelled: _count(json['cancelled']),
    );
  }

  final int running;
  final int waiting;
  final int queued;
  final int idle;
  final int failed;
  final int recovered;
  final int quotaRecovered;
  final int cancelled;

  /// Lanes that ended without counting as failures.
  int get resolved => recovered + quotaRecovered + cancelled;

  int of(FleetLaneState state) => switch (state) {
    FleetLaneState.running => running,
    FleetLaneState.waiting => waiting,
    FleetLaneState.queued => queued,
    FleetLaneState.idle => idle,
    FleetLaneState.failed => failed,
  };
}

class FleetTodayOutcomes {
  const FleetTodayOutcomes({
    required this.observedAt,
    required this.dayStart,
    required this.partial,
    required this.real,
    required this.quotaRecovered,
    required this.quotaUnrecovered,
    required this.unclassified,
  });

  static FleetTodayOutcomes? parse(Map<String, dynamic> json) {
    final observedAt = _time(json['observedAt']);
    final dayStart = _time(json['dayStart']);
    final kind = json['kind'];
    if (observedAt == null ||
        dayStart == null ||
        (kind != 'complete' && kind != 'partial')) {
      return null;
    }
    return FleetTodayOutcomes(
      observedAt: observedAt,
      dayStart: dayStart,
      partial: kind == 'partial',
      real: _count(json['real']),
      quotaRecovered: _count(json['quotaRecovered']),
      quotaUnrecovered: _count(json['quotaUnrecovered']),
      unclassified: _count(json['unclassified']),
    );
  }

  final DateTime observedAt;
  final DateTime dayStart;
  final bool partial;
  final int real;
  final int quotaRecovered;
  final int quotaUnrecovered;
  final int unclassified;

  bool isToday(DateTime now) =>
      !now.isBefore(dayStart) &&
      now.isBefore(dayStart.add(const Duration(days: 1)));
}
