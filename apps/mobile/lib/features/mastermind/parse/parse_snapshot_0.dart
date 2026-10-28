part of 'snapshot_parser.dart';

MastermindSnapshot parseRootSnapshot(JsonReader input) {
  final history = parseResolvedHistory([
    if (input.object()['decisions'] case final List<dynamic> decisions)
      for (final row in decisions)
        if (row is Map<String, dynamic> && row['status'] == 'resolved') row,
    if (input.object()['decisions_resolved'] case final List<dynamic> resolved)
      ...resolved,
  ]);
  final r =
      JsonReader(
        adaptHubCompanions(
          adaptDecisionCollections({
            ...input.object(),
            'decisions_resolved': history.rows,
          }, acceptsItem: acceptsDecisionItem),
        ),
        input.path,
      )..keys(
        [...input.object().keys, 'decisions_resolved'],
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
    workCounts: hubWorkCounts(input.object()['work']),
    resolvedItems: history.items,
    schemaVersion: r.field('schema_version').string(constant: '1.4'),
    generatedAt: r.field('generated_at').utcTimestamp(),
    now: parseSnapshotNow(r.field('now')),
    lanes: parseLaneItems(r.field('lanes')),
    backlog: parseBacklogEntries(r.field('backlog')),
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
    needsYou: parseOpenNeedsYouItems(r.field('needs_you')),
  );
}

SnapshotProducts parseSnapshotProducts(JsonReader r) {
  r.keys(['releases', 'quotas'], ['releases', 'quotas']);
  return SnapshotProducts(
    releases: r.field('releases').list(parseProductRelease),
    quotas: r.field('quotas').list(parseProductQuota),
  );
}
