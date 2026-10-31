part of 'snapshot_parser.dart';

Models parseModels(JsonReader r) {
  r.keys(
    ['coverage', 'observed_at', 'breakdown', 'series'],
    ['coverage', 'observed_at', 'breakdown', 'series'],
  );
  return Models(
    coverage: r
        .field('coverage')
        .enumOf<Coverage>(Coverage.values, (v) => v.wireName),
    observedAt: r.field('observed_at').nullable((v) => v.utcTimestamp()),
    breakdown: r.field('breakdown').list(parseModelBreakdown, maxItems: 1000),
    series: r.field('series').list(parseModelPoint, maxItems: 7000),
  );
}

ModelBreakdown parseModelBreakdown(JsonReader r) {
  r.keys(
    [
      'model',
      'role',
      'effort',
      'runs',
      'active',
      'completed',
      'terminal',
      'success',
      'rework',
      'success_rate',
      'rework_rate',
      'median_duration_seconds',
      'tokens_per_success',
      'session_percent_per_success',
      'tokens_measured_runs',
      'session_measured_runs',
      'success_rate_change_7d',
      'tentative',
    ],
    [
      'model',
      'role',
      'effort',
      'runs',
      'active',
      'completed',
      'terminal',
      'success',
      'rework',
      'success_rate',
      'rework_rate',
      'median_duration_seconds',
      'tokens_per_success',
      'session_percent_per_success',
      'tokens_measured_runs',
      'session_measured_runs',
      'success_rate_change_7d',
      'tentative',
    ],
  );
  return ModelBreakdown(
    model: r
        .field('model')
        .enumOf<ModelFamily>(ModelFamily.values, (v) => v.wireName),
    role: r.field('role').enumOf<RunRole>(RunRole.values, (v) => v.wireName),
    effort: r.field('effort').enumOf<Effort>(Effort.values, (v) => v.wireName),
    runs: r.field('runs').integer(min: 0),
    active: r.field('active').integer(min: 0),
    completed: r.field('completed').integer(min: 0),
    terminal: r.field('terminal').integer(min: 0),
    success: r.field('success').integer(min: 0),
    rework: r.field('rework').integer(min: 0),
    successRate: r
        .field('success_rate')
        .nullable((v) => v.number(min: 0, max: 1)),
    reworkRate: r
        .field('rework_rate')
        .nullable((v) => v.number(min: 0, max: 1)),
    medianDurationSeconds: r
        .field('median_duration_seconds')
        .nullable((v) => v.number(min: 0)),
    tokensPerSuccess: r
        .field('tokens_per_success')
        .nullable((v) => v.number(min: 0)),
    sessionPercentPerSuccess: r
        .field('session_percent_per_success')
        .nullable((v) => v.number(min: 0)),
    tokensMeasuredRuns: r.field('tokens_measured_runs').integer(min: 0),
    sessionMeasuredRuns: r.field('session_measured_runs').integer(min: 0),
    successRateChange7d: r
        .field('success_rate_change_7d')
        .nullable((v) => v.number()),
    tentative: r.field('tentative').boolean(),
  );
}

ModelPoint parseModelPoint(JsonReader r) {
  r.keys(
    [
      't',
      'model',
      'role',
      'effort',
      'runs',
      'active',
      'completed',
      'terminal',
      'success',
      'rework',
      'success_rate',
      'rework_rate',
      'median_duration_seconds',
      'tokens_per_success',
      'session_percent_per_success',
      'tokens_measured_runs',
      'session_measured_runs',
      'success_rate_change_7d',
      'tentative',
    ],
    [
      't',
      'model',
      'role',
      'effort',
      'runs',
      'active',
      'completed',
      'terminal',
      'success',
      'rework',
      'success_rate',
      'rework_rate',
      'median_duration_seconds',
      'tokens_per_success',
      'session_percent_per_success',
      'tokens_measured_runs',
      'session_measured_runs',
      'success_rate_change_7d',
      'tentative',
    ],
  );
  return ModelPoint(
    t: r.field('t').utcTimestamp(),
    model: r
        .field('model')
        .enumOf<ModelFamily>(ModelFamily.values, (v) => v.wireName),
    role: r.field('role').enumOf<RunRole>(RunRole.values, (v) => v.wireName),
    effort: r.field('effort').enumOf<Effort>(Effort.values, (v) => v.wireName),
    runs: r.field('runs').integer(min: 0),
    active: r.field('active').integer(min: 0),
    completed: r.field('completed').integer(min: 0),
    terminal: r.field('terminal').integer(min: 0),
    success: r.field('success').integer(min: 0),
    rework: r.field('rework').integer(min: 0),
    successRate: r
        .field('success_rate')
        .nullable((v) => v.number(min: 0, max: 1)),
    reworkRate: r
        .field('rework_rate')
        .nullable((v) => v.number(min: 0, max: 1)),
    medianDurationSeconds: r
        .field('median_duration_seconds')
        .nullable((v) => v.number(min: 0)),
    tokensPerSuccess: r
        .field('tokens_per_success')
        .nullable((v) => v.number(min: 0)),
    sessionPercentPerSuccess: r
        .field('session_percent_per_success')
        .nullable((v) => v.number(min: 0)),
    tokensMeasuredRuns: r.field('tokens_measured_runs').integer(min: 0),
    sessionMeasuredRuns: r.field('session_measured_runs').integer(min: 0),
    successRateChange7d: r
        .field('success_rate_change_7d')
        .nullable((v) => v.number()),
    tentative: r.field('tentative').boolean(),
  );
}
