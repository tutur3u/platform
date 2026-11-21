import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildZoneLatencyQuery,
  parseDeploys,
  parseZoneWindows,
  readCredentials,
  redact,
  runGraphql,
} from './perf-regression-cloudflare.mjs';
import {
  analyzeApp,
  detect,
  loadApps,
  parseArgs,
  rerun,
  splitWindows,
} from './perf-regression-detector.mjs';
import {
  computeBaseline,
  evaluateWindows,
  isErrorJump,
  latencyTrigger,
  suspectDeploys,
  versionSummary,
} from './perf-regression-rules.mjs';

const FORMS_FIXTURE = new URL(
  './fixtures/forms-rollback-2026-11-20.json',
  import.meta.url
).pathname;
const W = 15 * 60_000;
const T0 = Date.parse('2026-11-20T00:00:00Z');

function series(p95s, { requests = 200, errors = [] } = {}) {
  return p95s.map((p95Ms, index) => ({
    start: new Date(T0 + index * W).toISOString(),
    end: new Date(T0 + (index + 1) * W).toISOString(),
    requests,
    errors: errors[index] ?? 0,
    p95Ms,
  }));
}

const APP = {
  name: 'forms',
  host: 'tuturuuu.com',
  locales: ['vi'],
  prefixes: ['/forms'],
  worker: 'tuturuuu-forms',
};

test('trigger is the lower of +25% and +150 ms', () => {
  assert.equal(latencyTrigger(763), 913);
  assert.equal(latencyTrigger(400), 500);
  assert.equal(latencyTrigger(null), null);
});

test('a single breaching window is noise; two consecutive windows breach', () => {
  const baseline = { p95Ms: 400, errorRate: 0 };
  assert.deepEqual(evaluateWindows(series([520, 410, 530, 405]), baseline), []);
  const [finding] = evaluateWindows(series([410, 520, 530, 410]), baseline);
  assert.equal(finding.metric, 'p95_ttfb_ms');
  assert.equal(finding.startTime, new Date(T0 + W).toISOString());
  assert.deepEqual(finding.observed, [520, 530]);
  assert.equal(finding.trigger, 500);
});

test('low-traffic windows neither breach nor count toward the baseline', () => {
  const quiet = series([900, 900], { requests: 10 });
  assert.deepEqual(evaluateWindows(quiet, { p95Ms: 400, errorRate: 0 }), []);
  assert.equal(computeBaseline(quiet).p95Ms, null);
});

test('baseline uses the median so one slow window does not move it', () => {
  const stats = computeBaseline(series([400, 410, 2000, 420, 405]));
  assert.equal(stats.p95Ms, 410);
  assert.equal(stats.windows, 5);
});

test('error-rate jumps fire on one window and ignore stray errors', () => {
  assert.equal(isErrorJump({ requests: 1000, errors: 3 }, 0), false);
  assert.equal(isErrorJump({ requests: 1000, errors: 12 }, 0.001), true);
  assert.equal(isErrorJump({ requests: 1000, errors: 12 }, 0.01), false);
  const [finding] = evaluateWindows(
    series([400, 400], { requests: 1000, errors: [0, 40] }),
    {
      p95Ms: 400,
      errorRate: 0.001,
    }
  );
  assert.equal(finding.metric, 'error_rate');
  assert.deepEqual(finding.observed, [0.04]);
});

test('error-rate jumps do not fire when there is no usable baseline', () => {
  const busy = series([400], { requests: 60, errors: [8] });
  const noBaseline = computeBaseline(series([400], { requests: 13 }));
  assert.equal(noBaseline.windows, 0);
  assert.deepEqual(evaluateWindows(busy, noBaseline), []);
  const withBaseline = computeBaseline(series([400, 400], { requests: 200 }));
  assert.equal(evaluateWindows(busy, withBaseline)[0]?.metric, 'error_rate');
});

test('suspects are deploys in the lookback window, newest first', () => {
  const deploys = [
    { versionId: 'old', createdAt: '2026-11-19T18:00:00Z' },
    { versionId: 'a', createdAt: '2026-11-20T00:10:00Z' },
    { versionId: 'b', createdAt: '2026-11-20T00:50:00Z' },
    { versionId: 'late', createdAt: '2026-11-20T03:00:00Z' },
  ];
  assert.deepEqual(
    suspectDeploys(deploys, '2026-11-20T00:45:00Z').map((d) => d.versionId),
    ['b', 'a']
  );
  const summary = versionSummary(series([400, 400, 600, 600]), [
    { versionId: 'a', sha: 'abc1234', createdAt: '2026-11-19T00:00:00Z' },
    { versionId: 'b', sha: 'def5678', createdAt: '2026-11-20T00:30:00Z' },
  ]);
  assert.deepEqual(
    summary.map(({ versionId, p95Ms }) => [versionId, p95Ms]),
    [
      ['a', 400],
      ['b', 600],
    ]
  );
});

test('zone query covers locale-prefixed mounts and keeps ids as env references', () => {
  const spec = buildZoneLatencyQuery({
    app: APP,
    since: '2026-11-20T00:00:00Z',
    until: '2026-11-20T01:00:00Z',
    windowMinutes: 15,
  });
  assert.match(spec.query, /edgeTimeToFirstByteMsP95/);
  assert.equal(spec.variables.zoneTag, '$CLOUDFLARE_ZONE_ID');
  assert.deepEqual(spec.variables.filter.OR, [
    { clientRequestPath_like: '/forms%' },
    { clientRequestPath_like: '/vi/forms%' },
  ]);
  assert.equal(spec.variables.errorFilter.edgeResponseStatus_geq, 500);
  // Cloudflare Early Hints cache fetches are not client traffic and must not
  // count toward requests, latency or errors.
  assert.equal(spec.variables.filter.requestSource_neq, 'earlyHintsCache');
  assert.equal(spec.variables.errorFilter.requestSource_neq, 'earlyHintsCache');
  assert.throws(
    () => buildZoneLatencyQuery({ app: APP, windowMinutes: 7 }),
    /window/
  );
});

test('parses zone windows and deploy annotations', () => {
  const windows = parseZoneWindows(
    {
      viewer: {
        zones: [
          {
            total: [
              {
                count: 100,
                dimensions: { datetimeFifteenMinutes: '2026-11-20T00:15:00Z' },
                quantiles: { edgeTimeToFirstByteMsP95: 520 },
              },
              {
                count: 90,
                dimensions: { datetimeFifteenMinutes: '2026-11-20T00:00:00Z' },
                quantiles: { edgeTimeToFirstByteMsP95: 410 },
              },
            ],
            errors: [
              {
                count: 4,
                dimensions: { datetimeFifteenMinutes: '2026-11-20T00:15:00Z' },
              },
            ],
          },
        ],
      },
    },
    15
  );
  assert.deepEqual(
    windows.map((w) => [w.start, w.requests, w.errors, w.p95Ms]),
    [
      ['2026-11-20T00:00:00.000Z', 90, 0, 410],
      ['2026-11-20T00:15:00.000Z', 100, 4, 520],
    ]
  );
  const [deploy] = parseDeploys(
    {
      result: {
        deployments: [
          {
            id: 'd1',
            created_on: '2026-11-20T00:05:00Z',
            versions: [
              { version_id: 'v-old', percentage: 10 },
              { version_id: 'v-new', percentage: 90 },
            ],
          },
        ],
      },
    },
    {
      result: {
        items: [
          {
            id: 'v-new',
            annotations: { 'workers/message': 'main 5b1c59e3b0' },
          },
        ],
      },
    }
  );
  assert.deepEqual([deploy.versionId, deploy.sha], ['v-new', '5b1c59e3b0']);
});

test('credentials are required by name and the token never leaks', async () => {
  assert.throws(
    () => readCredentials({}),
    /CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID/
  );
  const credentials = {
    token: 'secret-token-value',
    accountId: 'acct',
    zoneId: 'zone',
  };
  assert.equal(
    redact('bad secret-token-value here', credentials),
    'bad *** here'
  );
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, init };
    return new Response(
      JSON.stringify({ errors: [{ message: 'echo secret-token-value' }] }),
      {
        status: 400,
      }
    );
  };
  const spec = buildZoneLatencyQuery({
    app: APP,
    since: 'a',
    until: 'b',
    windowMinutes: 15,
  });
  await assert.rejects(runGraphql(spec, credentials, fetchImpl), (error) => {
    assert.doesNotMatch(error.message, /secret-token-value/);
    return true;
  });
  assert.equal(JSON.parse(sent.init.body).variables.zoneTag, 'zone');
  assert.equal(sent.init.headers.authorization, 'Bearer secret-token-value');
});

test('parses CLI options and rejects bad input', () => {
  const options = parseArgs(['--apps', 'forms,tools', '--window-minutes', '5']);
  assert.deepEqual(
    [options.mode, options.apps, options.windowMinutes],
    ['detect', ['forms', 'tools'], 5]
  );
  assert.equal(
    parseArgs(['rerun', '--record', 'r.json']).query,
    'zone-latency'
  );
  assert.throws(() => parseArgs(['rerun']), /--record/);
  assert.throws(
    () => parseArgs(['--evaluate-windows', '0']),
    /evaluate-windows/
  );
  assert.throws(() => parseArgs(['--token', 'x']), /Unknown option/);
  assert.throws(() => loadApps(['nope']), /unknown app/);
  assert.ok(loadApps(null).some((app) => app.worker === 'tuturuuu-forms'));
});

test('splits baseline and evaluation windows around now', () => {
  const windows = series([1, 2, 3, 4, 5, 6]);
  const { baseline, current } = splitWindows(windows, {
    now: new Date(T0 + 5 * W).toISOString(),
    windowMinutes: 15,
    evaluateWindows: 2,
    baselineHours: 1,
  });
  assert.deepEqual(
    baseline.map((w) => w.p95Ms),
    [1, 2, 3]
  );
  assert.deepEqual(
    current.map((w) => w.p95Ms),
    [4, 5]
  );
});

test('records carry reproducible queries and suspects, not raw windows', () => {
  const windows = series([...Array(12).fill(400), 560, 580]);
  const [record] = analyzeApp({
    app: APP,
    windows,
    deploys: [
      {
        versionId: 'v2',
        sha: 'abc1234',
        createdAt: new Date(T0 + 11.5 * W).toISOString(),
      },
    ],
    options: {
      now: windows.at(-1).end,
      windowMinutes: 15,
      evaluateWindows: 4,
      baselineHours: 3,
    },
    detectedAt: windows.at(-1).end,
  });
  assert.equal(record.app, 'forms');
  assert.deepEqual(
    record.suspects.map((s) => s.sha),
    ['abc1234']
  );
  assert.deepEqual(
    record.queries.map((q) => q.name),
    ['zone-latency', 'worker-versions']
  );
  assert.match(
    record.queries[0].rerun,
    /rerun --record <record.json> --regression perf-forms-p95_ttfb_ms-/
  );
  assert.equal(JSON.stringify(record).includes('"requests"'), false);
});

test('backtest: the Forms rollback fixture breaches at the recorded trigger', async () => {
  const result = await detect(
    { ...parseArgs(['--apps', 'forms']), fixture: FORMS_FIXTURE },
    { config: { host: 'tuturuuu.com', locales: [], apps: { forms: APP } } }
  );
  const [record] = result.regressions;
  assert.equal(result.source, 'fixture');
  assert.equal(record.trigger, 913);
  assert.equal(record.observed[0], 980);
  assert.equal(record.startTime, '2026-11-19T22:00:00.000Z');
  assert.equal(record.suspects[0].versionId, 'forms-candidate');
});

test('rerun executes a stored query from a record file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'perf-factory-'));
  const recordPath = join(dir, 'record.json');
  const spec = buildZoneLatencyQuery({
    app: APP,
    since: 'a',
    until: 'b',
    windowMinutes: 15,
  });
  writeFileSync(
    recordPath,
    JSON.stringify({ regressions: [{ id: 'r1', queries: [{ ...spec }] }] })
  );
  const env = {
    CLOUDFLARE_API_TOKEN: 't',
    CLOUDFLARE_ACCOUNT_ID: 'a',
    CLOUDFLARE_ZONE_ID: 'z',
  };
  const data = await rerun(
    parseArgs(['rerun', '--record', recordPath, '--regression', 'r1']),
    {
      env,
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: { ok: true } })),
    }
  );
  assert.deepEqual(data, { ok: true });
});
