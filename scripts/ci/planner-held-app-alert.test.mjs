import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  alertKey,
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

function fakeSink(openKeys = []) {
  const open = new Set(openKeys);
  const calls = [];
  const send = async (alert) => {
    calls.push(alert);
    if (alert.state === 'failing') {
      const action = open.has(alert.key) ? 'comment' : 'open';
      open.add(alert.key);
      return action;
    }
    if (!open.has(alert.key)) return 'none';
    open.delete(alert.key);
    return 'close';
  };
  return { send, calls };
}

test('a new held app opens one internal alert task keyed by app', async () => {
  const { send, calls } = fakeSink();
  const actions = await syncAlerts(
    summarizeHeldApps(jobs(), 'failure'),
    run,
    send
  );
  assert.deepEqual(actions, ['open:deploy-meet-cloudflare']);
  const opened = calls.find((call) => call.state === 'failing');
  assert.equal(opened.key, 'planner-held:deploy-meet-cloudflare');
  assert.equal(opened.title, 'Production planner holds deploy-meet-cloudflare');
  assert.equal(opened.runUrl, `${run.url}/attempts/1`);
});

test('an open task is commented while held and resolved once the app passes', async () => {
  const { send } = fakeSink([
    alertKey('deploy-meet-cloudflare'),
    alertKey('deploy-parley-cloudflare'),
  ]);
  const actions = await syncAlerts(
    summarizeHeldApps(jobs(), 'failure'),
    run,
    send
  );
  assert.deepEqual(actions, [
    'comment:deploy-meet-cloudflare',
    'close:deploy-parley-cloudflare',
  ]);
});

test('alert keys are safe for the task sink', () => {
  assert.equal(
    alertKey('Deploy_Meet Cloudflare'),
    'planner-held:deploy-meet-cloudflare'
  );
  assert.ok(alertKey('x'.repeat(200)).length <= 80);
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
  assert.doesNotMatch(workflow, /issues: write/);
  assert.match(workflow, /environment: ci-alerts/);
  // The only secret is the narrowly scoped internal alert-sink token.
  assert.deepEqual(
    [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((match) => match[1]),
    ['TTR_CI_ALERT_TOKEN']
  );
});

test('a blocked planner opens its own task and resolves it once unblocked', async () => {
  const sink = fakeSink();
  const blocked = summarizeHeldApps(
    jobs({ 'deploy-colab-cloudflare / deploy': 'failure' }),
    'failure'
  );
  const actions = await syncAlerts(blocked, run, sink.send);
  assert.ok(actions.includes(`open:${BLOCKED_KEY}`));
  assert.ok(
    sink.calls.some(
      (call) =>
        call.key === alertKey(BLOCKED_KEY) &&
        call.title === 'Production planner is blocked for migrations'
    )
  );
  const cleared = await syncAlerts(
    summarizeHeldApps(
      jobs({
        'deploy-meet-cloudflare / Evaluate Meet production publication and exact-source CI':
          'success',
      }),
      'success'
    ),
    run,
    sink.send
  );
  assert.deepEqual(cleared.sort(), [
    'close:deploy-meet-cloudflare',
    `close:${BLOCKED_KEY}`,
  ]);
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
