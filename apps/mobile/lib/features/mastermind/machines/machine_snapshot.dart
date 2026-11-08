/// Sanitized machine data. No collector identifiers or arbitrary display text.
class MachineSnapshot {
  const MachineSnapshot({this.machines, this.collectedAt, this.coverage});
  final List<Machine>? machines;
  final DateTime? collectedAt;
  final String? coverage;
  bool stale(DateTime now) =>
      coverage == 'stale' ||
      coverage == 'missing' ||
      collectedAt == null ||
      now.difference(collectedAt!) > const Duration(minutes: 15);
}

class Machine {
  const Machine({
    required this.id,
    required this.displayName,
    required this.role,
    required this.status,
    required this.rules,
    required this.alerts,
    required this.running,
    required this.metrics,
    required this.specs,
    required this.history,
    this.lastSeenAt,
    this.scheduling,
    this.osFamily,
    this.thermal,
    this.metricsAt,
    this.lastSeenAgeSeconds,
    this.runningMore,
  });
  final String id;
  final String displayName;
  final String? role;
  final String? status;
  final String? osFamily;
  final String? scheduling;
  final String? thermal;
  final DateTime? lastSeenAt;
  final DateTime? metricsAt;
  final double? lastSeenAgeSeconds;
  final double? runningMore;
  final List<String> rules;
  final List<MachineAlert> alerts;
  final List<MachineRunning> running;
  final Map<String, double?> metrics;
  final Map<String, double?> specs;
  final Map<String, List<MachinePoint>> history;
}

class MachineAlert {
  const MachineAlert(this.code, this.level, this.since);
  final String code;
  final String? level;
  final DateTime? since;
}

class MachineRunning {
  const MachineRunning(
    this.kind,
    this.product,
    this.count,
    this.oldestAgeSeconds,
    this.laneIds,
  );
  final String kind;
  final String? product;
  final double? count;
  final double? oldestAgeSeconds;
  final List<String> laneIds;
}

class MachinePoint {
  const MachinePoint(this.t, this.value);
  final DateTime t;
  final double? value;
}

enum MachineGroup { attention, online, offline }

Map<MachineGroup, List<Machine>> groupMachines(List<Machine> machines) => {
  for (final group in MachineGroup.values)
    group: List.unmodifiable(
      machines.where(
        (m) =>
            (m.alerts.isNotEmpty
                ? MachineGroup.attention
                : m.status == 'online'
                ? MachineGroup.online
                : MachineGroup.offline) ==
            group,
      ),
    ),
};
