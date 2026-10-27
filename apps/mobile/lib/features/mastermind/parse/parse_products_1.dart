part of 'snapshot_parser.dart';

EnvironmentRow parseEnvironmentRow(JsonReader r) {
  r.keys(
    [
      'product',
      'environment',
      'released_at',
      'age_seconds',
      'version_tag',
      'sha',
      'commit_subject',
      'deploy_status',
      'ci_state',
      'observed_at',
      'freshness',
      'evidence',
    ],
    [
      'product',
      'environment',
      'released_at',
      'age_seconds',
      'version_tag',
      'sha',
      'commit_subject',
      'deploy_status',
      'ci_state',
      'observed_at',
      'freshness',
      'evidence',
    ],
  );
  return EnvironmentRow(
    product: r
        .field('product')
        .enumOf<ReleaseProduct>(ReleaseProduct.values, (v) => v.wireName),
    environment: r
        .field('environment')
        .enumOf<Environment>(Environment.values, (v) => v.wireName),
    releasedAt: r.field('released_at').nullable((v) => v.utcTimestamp()),
    ageSeconds: r.field('age_seconds').nullable((v) => v.integer(min: 0)),
    versionTag: r.field('version_tag').nullable((v) => v.string(maxLength: 80)),
    sha: r
        .field('sha')
        .nullable((v) => v.string(pattern: RegExp(r'^[a-f0-9]{7,12}$'))),
    commitSubject: r
        .field('commit_subject')
        .nullable((v) => v.string(maxLength: 120)),
    deployStatus: r
        .field('deploy_status')
        .enumOf<DeployStatus>(DeployStatus.values, (v) => v.wireName),
    ciState: r
        .field('ci_state')
        .enumOf<CiState>(CiState.values, (v) => v.wireName),
    observedAt: r.field('observed_at').nullable((v) => v.utcTimestamp()),
    freshness: r
        .field('freshness')
        .enumOf<Freshness>(Freshness.values, (v) => v.wireName),
    evidence: r
        .field('evidence')
        .enumOf<Evidence>(Evidence.values, (v) => v.wireName),
  );
}

QuotaPoint parseQuotaPoint(JsonReader r) {
  r.keys(['instance', 't', 'pct'], ['instance', 't', 'pct']);
  return QuotaPoint(
    instance: r.field('instance').stringIn(PoolLabels.quota),
    t: r.field('t').utcTimestamp(),
    pct: r.field('pct').nullable((v) => v.number(min: 0, max: 100)),
  );
}

QuotaForecast parseQuotaForecast(JsonReader r) {
  r.keys(
    ['instance', 'projected_empty_at', 'resets_at'],
    ['instance', 'projected_empty_at', 'resets_at'],
  );
  return QuotaForecast(
    instance: r.field('instance').stringIn(PoolLabels.quota),
    projectedEmptyAt: r
        .field('projected_empty_at')
        .nullable((v) => v.utcTimestamp()),
    resetsAt: r.field('resets_at').nullable((v) => v.utcTimestamp()),
  );
}
