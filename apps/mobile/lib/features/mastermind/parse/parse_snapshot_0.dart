part of 'snapshot_parser.dart';

MastermindSnapshot parseRootSnapshot(JsonReader r) {
  r.keys(
    [
      'schema_version',
      'generated_at',
      'now',
      'lanes',
      'backlog',
      'products',
      'environments',
      'decisions',
      'decisions_skipped',
      'observability',
      'sources',
    ],
    [
      'schema_version',
      'generated_at',
      'now',
      'lanes',
      'backlog',
      'products',
      'environments',
      'decisions',
      'decisions_skipped',
      'observability',
      'sources',
    ],
  );
  return MastermindSnapshot(
    schemaVersion: r.field('schema_version').string(constant: '1.3'),
    generatedAt: r.field('generated_at').utcTimestamp(),
    now: parseSnapshotNow(r.field('now')),
    lanes: r.field('lanes').list(parseLaneItem),
    backlog: r.field('backlog').list(parseBacklogEntry),
    products: parseSnapshotProducts(r.field('products')),
    environments: r.field('environments').list(parseEnvironmentRow),
    decisions: r.field('decisions').list(parseDecision, maxItems: 1000),
    decisionsSkipped: r.field('decisions_skipped').integer(min: 0),
    observability: parseObservability(r.field('observability')),
    sources: r.field('sources').list(parseSource),
  );
}

SnapshotNow parseSnapshotNow(JsonReader r) {
  r.keys(
    ['after_seq', 'latest_seq', 'cursor_gap', 'digest', 'needs_you'],
    ['after_seq', 'latest_seq', 'cursor_gap', 'digest', 'needs_you'],
  );
  return SnapshotNow(
    afterSeq: r.field('after_seq').integer(min: 0),
    latestSeq: r.field('latest_seq').integer(min: 0),
    cursorGap: r.field('cursor_gap').boolean(),
    digest: r.field('digest').list(parseSnapshotEvent),
    needsYou: r.field('needs_you').list(parseOpenNeedsYou),
  );
}

SnapshotProducts parseSnapshotProducts(JsonReader r) {
  r.keys(['releases', 'quotas'], ['releases', 'quotas']);
  return SnapshotProducts(
    releases: r.field('releases').list(parseProductRelease),
    quotas: r.field('quotas').list(parseProductQuota),
  );
}
