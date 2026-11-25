import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  actualOutcome,
  compare,
  main,
  MAX_LIMIT,
  parseArgs,
  render,
  runsByWorkflow,
} from './ci-shadow-report.mjs';

const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/ci-shadow-report/${name}.json`, import.meta.url),
      'utf8'
    )
  );
const REGISTRATIONS = fixture('registrations');
const RUNS = fixture('runs');
const NEW = '2'.repeat(40);
const OLD = '1'.repeat(40);

test('classifies what GitHub did with a workflow', () => {
  assert.equal(actualOutcome(undefined), 'not-started');
  assert.equal(actualOutcome({ status: 'queued' }), 'running');
  for (const [conclusion, outcome] of [
    ['success', 'ran'],
    ['failure', 'ran'],
    ['timed_out', 'ran'],
    ['skipped', 'skipped'],
    ['cancelled', 'cancelled'],
  ])
    assert.equal(actualOutcome({ status: 'completed', conclusion }), outcome);
});

test('keeps the newest push run of each workflow', () => {
  const byFile = runsByWorkflow([
    { id: 1, event: 'push', path: '.github/workflows/a.yaml' },
    { id: 3, event: 'push', path: '.github/workflows/a.yaml' },
    { id: 2, event: 'push', path: '.github/workflows/a.yaml' },
    { id: 4, event: 'workflow_dispatch', path: '.github/workflows/b.yaml' },
    { id: 5, event: 'push', path: '.github/workflows/c.yaml@refs/heads/main' },
  ]);
  assert.deepEqual([...byFile.keys()], ['a.yaml', 'c.yaml']);
  assert.equal(byFile.get('a.yaml').id, 3);
});

test('compares each plan with the runs GitHub started', () => {
  const report = compare(
    REGISTRATIONS.registrations,
    new Map(
      Object.entries(RUNS).map(([sha, body]) => [sha, body.workflow_runs])
    )
  );
  assert.deepEqual(report.summary, {
    registrations: 2,
    planned: 4,
    started: 5,
    saved: 2,
    missed: 1,
  });
  assert.deepEqual(
    report.commits.map(({ sha, planned, started, saved, missed }) => [
      sha,
      planned,
      started,
      saved,
      missed,
    ]),
    [
      [NEW, 2, 2, 1, 1],
      [OLD, 2, 3, 1, 0],
    ]
  );
  const rows = Object.fromEntries(
    report.workflows.map((row) => [row.workflow, row])
  );
  assert.deepEqual(
    report.workflows.map((row) => row.workflow),
    [
      'calendar-cloudflare.yaml',
      'codeql.yml',
      'mobile.yaml',
      'tsrs-shadow.yaml',
      'type-check.yaml',
    ]
  );
  assert.deepEqual(rows['calendar-cloudflare.yaml'], {
    workflow: 'calendar-cloudflare.yaml',
    planned: 1,
    ran: 1,
    skipped: 1,
    cancelled: 0,
    running: 0,
    'not-started': 0,
    saved: 1,
    missed: 0,
    unplanned: 0,
  });
  assert.equal(rows['codeql.yml']['not-started'], 1, 'dispatch runs ignored');
  assert.equal(rows['mobile.yaml'].missed, 1);
  assert.equal(rows['type-check.yaml'].cancelled, 1);
  assert.equal(rows['tsrs-shadow.yaml'].unplanned, 1);
  assert.equal(rows['ci-register.yaml'], undefined);

  const text = render(report);
  assert.match(text, /2 started runs the plan would have saved/u);
  assert.match(
    text,
    /\| calendar-cloudflare\.yaml \| 1 \| 1 \| 1 \| 0 \| 0 \| 0 \| 1 \| 0 \| 0 \|/u
  );
  assert.match(text, /\| 2222222222 \| 2 \| 2 \| 1 \| 1 \|/u);
});

test('bounds the number of commits read', () => {
  assert.deepEqual(parseArgs([]), { limit: 10, json: false });
  assert.deepEqual(parseArgs(['--limit', '30', '--json']), {
    limit: 30,
    json: true,
  });
  for (const argv of [
    ['--limit', '0'],
    ['--limit', String(MAX_LIMIT + 1)],
    ['--limit', 'x'],
    ['--since', '1d'],
  ])
    assert.throws(() => parseArgs(argv));
});

test('reads registrations once and GitHub once per SHA', async () => {
  const coordinator = [];
  const gh = [];
  const report = await main({
    argv: ['--limit', '2', '--json'],
    env: {
      DEPLOY_COORDINATOR_ORIGIN: 'https://deploy.test/',
      DEPLOY_COORDINATOR_OPERATOR_TOKEN: 'operator',
      GITHUB_REPOSITORY: 'tutur3u/platform',
    },
    fetch: async (url, init) => {
      coordinator.push({ url, init });
      return Response.json(REGISTRATIONS);
    },
    gh: (args) => {
      gh.push(args);
      const sha = args.find((arg) => arg.startsWith('head_sha=')).slice(9);
      return JSON.stringify(RUNS[sha]);
    },
    write: () => {},
  });
  assert.equal(coordinator.length, 1);
  assert.equal(
    coordinator[0].url,
    'https://deploy.test/v1/ci/main/registrations?limit=2'
  );
  assert.equal(coordinator[0].init.headers.Authorization, 'Bearer operator');
  assert.equal(
    coordinator[0].init.headers['X-Deploy-Actor'],
    'ci-shadow-report'
  );
  assert.equal(gh.length, 2);
  assert.deepEqual(gh[0], [
    'api',
    '-X',
    'GET',
    'repos/tutur3u/platform/actions/runs',
    '-f',
    `head_sha=${NEW}`,
    '-f',
    'event=push',
    '-f',
    'per_page=100',
  ]);
  assert.equal(report.summary.saved, 2);
});

test('fails without the operator token or on a coordinator error', async () => {
  await assert.rejects(
    main({
      argv: [],
      env: {},
      fetch: async () => assert.fail(),
      gh: () => assert.fail(),
      write: () => {},
    }),
    /DEPLOY_COORDINATOR_OPERATOR_TOKEN/u
  );
  await assert.rejects(
    main({
      argv: [],
      env: { DEPLOY_COORDINATOR_OPERATOR_TOKEN: 'x' },
      fetch: async () => new Response('{}', { status: 404 }),
      gh: () => assert.fail(),
      write: () => {},
    }),
    /answered 404/u
  );
});
