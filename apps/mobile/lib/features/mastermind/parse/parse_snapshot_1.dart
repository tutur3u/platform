part of 'snapshot_parser.dart';

Observability parseObservability(JsonReader r) {
  r.keys(
    [
      'quota_series',
      'quota_forecasts',
      'speed_series',
      'children_series',
      'staff',
      'ci',
      'cadence',
      'usage',
      'models',
      'fleet',
      'coordination',
      'delivery',
      'security',
    ],
    [
      'quota_series',
      'quota_forecasts',
      'speed_series',
      'children_series',
      'staff',
      'ci',
      'cadence',
      'usage',
      'models',
      'fleet',
      'coordination',
      'delivery',
      'security',
    ],
  );
  return Observability(
    quotaSeries: r
        .field('quota_series')
        .list(parseQuotaPoint, maxItems: 161312),
    quotaForecasts: r
        .field('quota_forecasts')
        .list(parseQuotaForecast, maxItems: 32),
    speedSeries: r.field('speed_series').list(parseSpeedPoint, maxItems: 5408),
    childrenSeries: r
        .field('children_series')
        .list(parseChildrenPoint, maxItems: 10816),
    staff: r.field('staff').list(parseStaff, maxItems: 32),
    ci: r.field('ci').list(parseCi, maxItems: 2),
    cadence: r.field('cadence').list(parseCadence, maxItems: 7),
    usage: parseUsage(r.field('usage')),
    models: parseModels(r.field('models')),
    fleet: parseFleet(r.field('fleet')),
    coordination: parseCoordination(r.field('coordination')),
    delivery: parseDelivery(r.field('delivery')),
    security: parseSecurity(r.field('security')),
  );
}

Source parseSource(JsonReader r) {
  r.keys(['source', 'state'], ['source', 'state']);
  return Source(
    source: r
        .field('source')
        .enumOf<SourceName>(SourceName.values, (v) => v.wireName),
    state: r
        .field('state')
        .enumOf<SourceState>(SourceState.values, (v) => v.wireName),
  );
}
