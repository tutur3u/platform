part of 'snapshot_parser.dart';

SnapshotEvent parseSnapshotEvent(JsonReader r) {
  r.keys(['seq', 'ts', 'kind', 'payload'], ['seq', 'ts', 'kind', 'payload']);
  return SnapshotEvent(
    seq: r.field('seq').integer(min: 1),
    ts: r.field('ts').utcTimestamp(),
    kind: r
        .field('kind')
        .enumOf<EventKind>(EventKind.values, (v) => v.wireName),
    payload: parseEventPayload(r.field('kind').string(), r.field('payload')),
  );
}

ProductRelease parseProductRelease(JsonReader r) {
  r.keys(
    ['product', 'prod_age_seconds', 'age_basis'],
    ['product', 'prod_age_seconds', 'age_basis'],
  );
  return ProductRelease(
    product: r
        .field('product')
        .enumOf<ReleaseProduct>(ReleaseProduct.values, (v) => v.wireName),
    prodAgeSeconds: r
        .field('prod_age_seconds')
        .nullable((v) => v.integer(min: 0)),
    ageBasis: r
        .field('age_basis')
        .enumOf<AgeBasis>(AgeBasis.values, (v) => v.wireName),
  );
}

ProductQuota parseProductQuota(JsonReader r) {
  r.keys(
    ['instance', 'remaining_percent', 'age_seconds'],
    ['instance', 'remaining_percent', 'age_seconds'],
  );
  return ProductQuota(
    instance: r
        .field('instance')
        .string(maxLength: 60, pattern: RegExp(r'^[A-Za-z0-9_]+$')),
    remainingPercent: r
        .field('remaining_percent')
        .nullable((v) => v.number(min: 0, max: 100)),
    ageSeconds: r.field('age_seconds').nullable((v) => v.integer(min: 0)),
  );
}
