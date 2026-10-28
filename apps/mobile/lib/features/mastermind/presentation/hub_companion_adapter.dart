import 'package:mobile/features/mastermind/model/enums.dart';

List<Map<String, dynamic>> _rows(Object? raw) =>
    raw is List ? raw.whereType<Map<String, dynamic>>().toList() : const [];

Map<String, dynamic> _object(Object? raw) =>
    raw is Map<String, dynamic> ? raw : const {};

/// Forge v1 keeps legacy fields intact and publishes reasons beside them.
Map<String, dynamic> adaptHubCompanions(Map<String, dynamic> raw) {
  final root = Map<String, dynamic>.from(raw);
  final work = _object(root['work']);
  final workLanes = {for (final row in _rows(work['lanes'])) row['id']: row};
  if (root['lanes'] is List) {
    root['lanes'] = [
      for (final row in root['lanes'] as List)
        if (row is Map<String, dynamic>)
          {
            ...row,
            if (workLanes[row['id']] case final companion?)
              for (final key in ['age_seconds', 'eta_seconds', 'status'])
                if (companion.containsKey(key)) key: companion[key],
          }
        else
          row,
    ];
  }
  final ship = {
    for (final row in _rows(root['ship']))
      if (ReleaseProduct.values.any((p) => p.wireName == row['product']))
        row['product']: row,
  };
  final environments = _rows(root['environments']);
  final present = {for (final row in environments) row['product']};
  if (root['environments'] is List) {
    root['environments'] = [
      for (final row in root['environments'] as List)
        if (row is Map<String, dynamic>)
          _shipFields(row, ship[row['product']])
        else
          row,
      for (final entry in ship.entries)
        if (!present.contains(entry.key))
          _shipFields({
            'product': entry.key,
            'environment': 'production',
            'released_at': null,
            'age_seconds': null,
            'version_tag': null,
            'sha': null,
            'commit_subject': null,
            'deploy_status': 'unknown',
            'ci_state': 'unknown',
            'observed_at': null,
            'freshness': 'unknown',
            'evidence': 'unknown',
          }, entry.value),
    ];
  }
  final obs = _object(root['observability']);
  final usage = _object(obs['usage']);
  final weekly = {
    for (final row in _rows(root['insights']))
      if (PoolLabels.usage.contains(row['instance']) && row['weekly'] is Map)
        row['instance']: _object(row['weekly']),
  };
  final instances = _rows(usage['instances']);
  final pools = {for (final row in instances) row['instance']};
  if (weekly.isNotEmpty) {
    root['observability'] = {
      ...obs,
      'usage': {
        ...usage,
        'instances': [
          for (final row in instances)
            {
              ...row,
              if (weekly[row['instance']] case final companion?)
                'weekly': _weeklyFields(_object(row['weekly']), companion),
            },
          for (final entry in weekly.entries)
            if (!pools.contains(entry.key))
              {
                'instance': entry.key,
                't': root['generated_at'],
                'session': _emptyWindow,
                'weekly': _weeklyFields(_emptyWindow, entry.value),
              },
        ],
      },
    };
  }
  return root;
}

const _emptyWindow = <String, dynamic>{
  'remaining_percent': null,
  'resets_at': null,
  'burn_percent_per_hour': null,
  'projected_remaining_at_reset': null,
  'pacing': null,
};

Map<String, dynamic> _weeklyFields(
  Map<String, dynamic> legacy,
  Map<String, dynamic> companion,
) => {
  ...legacy,
  for (final key in _emptyWindow.keys)
    if (companion.containsKey(key)) key: companion[key],
};

Map<String, dynamic> _shipFields(
  Map<String, dynamic> legacy,
  Map<String, dynamic>? companion,
) => {
  ...legacy,
  if (companion != null)
    for (final entry in const {
      'deploy': 'deploy_status',
      'ci': 'ci_state',
      'released_at': 'released_at',
    }.entries)
      if (companion.containsKey(entry.key)) entry.value: companion[entry.key],
};

Map<LaneState, int>? hubWorkCounts(Object? raw) {
  final counts = _object(_object(raw)['counts']);
  if (counts.isEmpty) return null;
  final result = <LaneState, int>{};
  for (final state in [LaneState.running, LaneState.waiting, LaneState.idle]) {
    final value = counts[state.wireName];
    if (value is! int || value < 0) return null;
    result[state] = value;
  }
  return Map.unmodifiable(result);
}
