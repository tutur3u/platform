part of 'snapshot_parser.dart';

Usage parseUsage(JsonReader r) {
  r.keys(
    ['coverage', 'instances', 'series', 'credits', 'gaps'],
    ['coverage', 'instances', 'series', 'credits'],
  );
  return Usage(
    gaps: r.has('gaps')
        ? [
            for (final raw in r.field('gaps').value! as List)
              if (UsageGap.parse(raw) case final gap?) gap,
          ]
        : const [],
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    instances: r.field('instances').list(parseUsagePoint, maxItems: 7),
    series: r.field('series').list(parseUsagePoint, maxItems: 20000),
    credits: r.field('credits').list(parseCreditPoint, maxItems: 1000),
  );
}

UsagePoint parseUsagePoint(JsonReader r) {
  r.keys(
    ['instance', 't', 'session', 'weekly'],
    ['instance', 't', 'session', 'weekly'],
  );
  return UsagePoint(
    instance: r.field('instance').stringIn(PoolLabels.usage),
    t: r.field('t').utcTimestamp(),
    session: parseUsageWindow(r.field('session')),
    weekly: parseUsageWindow(r.field('weekly')),
  );
}

UsageWindow parseUsageWindow(JsonReader input) {
  var r = input;
  final fields = {
    for (final e in r.object().entries) e.key: HubField.parse(e.value),
  };
  r = JsonReader({
    for (final e in fields.entries) e.key: e.value.value,
  }, r.path);
  r.keys(
    [
      'remaining_percent',
      'resets_at',
      'burn_percent_per_hour',
      'projected_remaining_at_reset',
      'pacing',
    ],
    [
      'remaining_percent',
      'resets_at',
      'burn_percent_per_hour',
      'projected_remaining_at_reset',
      'pacing',
    ],
  );
  return UsageWindow(
    fields: fields,
    remainingPercent: r
        .field('remaining_percent')
        .nullable((v) => v.number(min: 0, max: 100)),
    resetsAt: r.field('resets_at').nullable((v) => v.utcTimestamp()),
    burnPercentPerHour: r
        .field('burn_percent_per_hour')
        .nullable((v) => v.number(min: 0)),
    projectedRemainingAtReset: r
        .field('projected_remaining_at_reset')
        .nullable((v) => v.number()),
    pacing: r
        .field('pacing')
        .nullable((v) => v.enumOf<Pacing>(Pacing.values, (v) => v.wireName)),
  );
}
