import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';

const machineDisplayNames = <String>{
  'Machine',
  'SSET Mac Studio',
  'Mac Studio',
  'Linux server',
  'Build Mac A',
  'Build Mac B',
  'Laptop',
  'Devbox',
  'Production host',
};
Map<String, dynamic> _map(Object? value) =>
    value is Map<String, dynamic> ? value : {};
List<dynamic> _list(Object? value) => value is List<dynamic> ? value : [];
String? _enum(Object? value, String choices) =>
    value is String && choices.split('|').contains(value) ? value : null;
double? _number(Object? value, {double? max}) =>
    value is num &&
        value.isFinite &&
        value >= 0 &&
        (max == null || value <= max)
    ? value.toDouble()
    : null;
DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toUtc() : null;

/// Unknown fields (including collector aliases) are discarded at this boundary.
MachineSnapshot parseMachineSnapshot(Map<String, dynamic> root) {
  final meta = _map(root['machines_meta']);
  final seen = <String>{};
  return MachineSnapshot(
    collectedAt: _date(meta['collected_at']),
    coverage: _enum(meta['coverage'], 'ok|partial|stale|missing'),
    machines: root['machines'] is! List
        ? null
        : List.unmodifiable([
            for (final row in _list(root['machines']).take(100))
              if (_parseMachine(_map(row), root) case final machine?)
                if (seen.add(machine.id)) machine,
          ]),
  );
}

Machine? _parseMachine(Map<String, dynamic> row, Map<String, dynamic> root) {
  final id = row['id'];
  if (id is! String ||
      id.length != 14 ||
      !RegExp(r'^m-[a-f0-9]{12}$').hasMatch(id)) {
    return null;
  }
  final metrics = _map(row['metrics']);
  final specs = _map(row['specs']);
  final role = _enum(row['role'], 'build|studio|laptop|prod_host|devbox|other');
  final series = _map(row['series']);
  final allSeries = _list(_map(root['observability'])['machine_series']);
  final rules = <String>[
    for (final rule in _list(row['rules']))
      if (_enum(
            rule,
            'findings_only|prod_reads_here_only|never_builds|'
            'no_heavy_work|light_work_only|prod_host_read_only',
          )
          case final known?)
        known,
  ];
  if (role == 'prod_host' && !rules.contains('prod_host_read_only')) {
    rules.add('prod_host_read_only');
  }
  return Machine(
    id: id,
    displayName: machineDisplayNames.contains(row['display_name'])
        ? row['display_name'] as String
        : 'Machine',
    role: role,
    status: _enum(row['status'], 'online|asleep|offline|unknown'),
    osFamily: _enum(specs['os_family'], 'macos|linux|windows'),
    scheduling: _enum(
      _map(row['scheduling'])['state'],
      'active|draining|paused',
    ),
    thermal: _enum(metrics['thermal'], 'nominal|fair|serious|critical'),
    lastSeenAt: _date(row['last_seen_at']),
    metricsAt: _date(metrics['t']),
    lastSeenAgeSeconds: _number(row['last_seen_age_seconds']),
    runningMore: _number(row['running_more']),
    rules: List.unmodifiable(rules),
    metrics: Map.unmodifiable({
      for (final key in [
        'cpu_pct',
        'load_1m',
        'ram_pct',
        'swap_gb',
        'disk_free_pct',
        'disk_free_gb',
        'temp_c',
      ])
        key: _number(metrics[key], max: key.endsWith('_pct') ? 100 : null),
    }),
    specs: Map.unmodifiable({
      for (final key in ['cores', 'ram_gb', 'disk_gb'])
        key: _number(specs[key]),
    }),
    alerts: List.unmodifiable([
      for (final value in _list(row['alerts']).take(20))
        if (_enum(
              _map(value)['code'],
              'disk_low|load_high|thermal|offline|swap_high',
            )
            case final code?)
          MachineAlert(
            code,
            _enum(_map(value)['level'], 'warning|critical'),
            _date(_map(value)['since']),
          ),
    ]),
    running: List.unmodifiable([
      for (final value in _list(row['running']).take(8))
        if (_enum(_map(value)['kind'], 'lane|build|merge_train|test|other')
            case final kind?)
          MachineRunning(
            kind,
            _enum(_map(value)['product'], 'tuturuuu|upskii|masteryai'),
            _number(_map(value)['count']),
            _number(_map(value)['oldest_age_seconds']),
            List.unmodifiable([
              for (final lane in _list(_map(value)['lane_ids']).take(20))
                if (lane is String &&
                    RegExp(r'^lane-[a-zA-Z0-9-]{1,80}$').hasMatch(lane))
                  lane,
            ]),
          ),
    ]),
    history: Map.unmodifiable({
      for (final key in ['cpu', 'ram', 'disk'])
        key: _points(series[key], allSeries),
    }),
  );
}

List<MachinePoint> _points(Object? ref, List<dynamic> allSeries) {
  final points = <MachinePoint>[];
  for (final entry in allSeries) {
    final s = _map(entry);
    if (ref is! String || s['id'] != ref) continue;
    for (final raw in _list(s['points']).take(1000)) {
      final p = _map(raw);
      final t = _date(p['t']);
      if (t != null) points.add(MachinePoint(t, _number(p['value'], max: 100)));
    }
  }
  points.sort((a, b) => a.t.compareTo(b.t));
  return List.unmodifiable(points);
}
