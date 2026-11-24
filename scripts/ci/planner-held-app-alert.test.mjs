import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ALERT_LABEL,
  BLOCKED_KEY,
  escapeAnnotation,
  isCurrentProductionHead,
  plannerJobs,
  reportMarkdown,
  summarizeHeldApps,
  syncAlerts,
} from './planner-held-app-alert.mjs';

const run = {
  sha: 'a'.repeat(40),
  url: 'https://github.com/o/r/actions/runs/7',
  attempt: '1',
  conclusion: 'failure',
};

function jobs(overrides = {}) {
  return Object.entries({
    plan: 'success',
    'deploy-web-cloudflare / Verify-Production': 'success',
    'deploy-meet-cloudflare / Evaluate Meet production publication and exact-source CI':
      'failure',
    'deploy-meet-cloudflare / deploy': 'skipped',
    'deploy-parley-cloudflare / deploy': 'success',
    'deploy-mail-native': 'skipped',
    ...overrides,
  }).map(([name, conclusion], index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion,
  }));
}

function fakeApi(open = []) {
  const calls = [];
  const api = async (path, options = {}) => {
    calls.push({ path, method: options.method ?? 'GET', body: options.body });
    if (path.includes('/issues?labels=')) return open;
    return {};
  };
  return { api, calls };
}

test('a held independent app is reported without blocking migrations', () => {
  const report = summarizeHeldApps(jobs(), 'failure');
  assert.deepEqual(report, {
    held: [
      {
        app: 'deploy-meet-cloudflare',
        jobs: [
          {
            name: 'deploy-meet-cloudflare / Evaluate Meet production publication and exact-source CI',
            conclusion: 'failure',
          },
        ],
      },
    ],
    recovered: ['deploy-parley-cloudflare', BLOCKED_KEY],
    blocking: null,
  });
  assert.match(
    reportMarkdown(report, run),
    /deploy-meet-cloudflare: .* failure/
  );
});

test('a failed control-plane job is reported as blocking', () => {
  const report = summarizeHeldApps(
    jobs({ 'deploy-colab-cloudflare / deploy': 'failure' }),
    'failure'
  );
  assert.equal(report.blocking, 'required-job-failed');
  assert.match(reportMarkdown(report, run), /blocked for migrations/);
});

test('a new held app opens one labeled issue with a per-app marker', async () => {
  const { api, calls } = fakeApi([]);
  const actions = await syncAlerts(
    summarizeHeldApps(jobs(), 'failure'),
    run,
    'o/r',
    api
  );
  assert.deepEqual(actions, ['open:deploy-meet-cloudflare']);
  const created = calls.find((call) => call.path === '/repos/o/r/issues');
  assert.deepEqual(created.body.labels, [ALERT_LABEL]);
  assert.match(
    created.body.body,
    /<!-- planner-held-app:deploy-meet-cloudflare -->/
  );
  assert.equal(
    created.body.title,
    'Production planner holds deploy-meet-cloudflare'
  );
});

test('an open issue is commented while held and closed once the app passes', async () => {
  const open = [
    {
      number: 5,
      user: { login: 'github-actions[bot]', type: 'Bot' },
      body: '<!-- planner-held-app:deploy-meet-cloudflare -->\nold',
    },
    {
      number: 6,
      user: { login: 'github-actions[bot]', type: 'Bot' },
      body: '<!-- planner-held-app:deploy-parley-cloudflare -->\nold',
    },
  ];
  const { api, calls } = fakeApi(open);
  const actions = await syncAlerts(
    summarizeHeldApps(jobs(), 'failure'),
    run,
    'o/r',
    api
  );
  assert.deepEqual(actions, [
    'comment:deploy-meet-cloudflare',
    'close:deploy-parley-cloudflare',
  ]);
  assert.ok(
    calls.some(
      (call) =>
        call.path === '/repos/o/r/issues/6' &&
        call.method === 'PATCH' &&
        call.body.state === 'closed'
    )
  );
  assert.ok(
    !calls.some(
      (call) => call.path === '/repos/o/r/issues/5' && call.method === 'PATCH'
    )
  );
});

test('job inventory pages until the total is read', async () => {
  const pages = [
    {
      total_count: 101,
      jobs: Array.from({ length: 100 }, (_, id) => ({ id })),
    },
    { total_count: 101, jobs: [{ id: 100 }] },
  ];
  const seen = [];
  const all = await plannerJobs('o/r', 7, 2, async (path) => {
    seen.push(path);
    return pages[seen.length - 1];
  });
  assert.equal(all.length, 101);
  assert.match(
    seen[1],
    /\/actions\/runs\/7\/attempts\/2\/jobs\?per_page=100&page=2$/
  );
});

test('the workflow reads the trusted planner run with least privilege', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/planner-held-app-alert.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(workflow, /workflows: \["Production Deployment Planner"\]/);
  assert.match(workflow, /branches: \[production\]/);
  assert.match(workflow, /head_repository\.full_name == github\.repository/);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('a blocked planner opens its own issue and closes it once unblocked', async () => {
  const blocked = summarizeHeldApps(
    jobs({ 'deploy-colab-cloudflare / deploy': 'failure' }),
    'failure'
  );
  const first = fakeApi([]);
  const actions = await syncAlerts(blocked, run, 'o/r', first.api);
  assert.ok(actions.includes(`open:${BLOCKED_KEY}`));
  const created = first.calls.find(
    (call) =>
      call.path === '/repos/o/r/issues' &&
      call.body.title === 'Production planner is blocked for migrations'
  );
  assert.ok(created);

  const open = [
    {
      number: 9,
      user: { login: 'github-actions[bot]', type: 'Bot' },
      body: `<!-- planner-held-app:${BLOCKED_KEY} -->`,
    },
  ];
  const later = fakeApi(open);
  const cleared = await syncAlerts(
    summarizeHeldApps(
      jobs({
        'deploy-meet-cloudflare / Evaluate Meet production publication and exact-source CI':
          'success',
      }),
      'success'
    ),
    run,
    'o/r',
    later.api
  );
  assert.deepEqual(cleared, [`close:${BLOCKED_KEY}`]);
});

test('pull requests and issues other accounts opened are never touched', async () => {
  const open = [
    {
      number: 3,
      pull_request: {},
      user: { login: 'github-actions[bot]', type: 'Bot' },
      body: '<!-- planner-held-app:deploy-parley-cloudflare -->',
    },
    {
      number: 4,
      user: { login: 'dependabot[bot]', type: 'Bot' },
      body: '<!-- planner-held-app:deploy-parley-cloudflare -->',
    },
  ];
  const { api, calls } = fakeApi(open);
  await syncAlerts(summarizeHeldApps(jobs(), 'failure'), run, 'o/r', api);
  assert.ok(
    !calls.some((call) => /\/issues\/(3|4)(\/|$)/.test(call.path)),
    'no comment or close on a pull request or a human issue'
  );
});

test('only the current production head changes alerts', async () => {
  const api = async () => ({ object: { sha: run.sha } });
  assert.equal(await isCurrentProductionHead('o/r', run.sha, api), true);
  assert.equal(
    await isCurrentProductionHead('o/r', 'b'.repeat(40), api),
    false
  );
});

test('annotation values cannot start a new workflow command', () => {
  assert.equal(
    escapeAnnotation('a%0A\n::warning::x\r'),
    'a%250A%0A::warning::x%0D'
  );
});
