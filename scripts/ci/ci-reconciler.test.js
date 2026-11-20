import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sourcePolicy from './ci-reconciler-policy.json' with { type: 'json' };
import {
  validatePolicy,
  trustedContext,
  mergeReceipts,
  summarize,
  summarizeApplied,
  planReconciliation,
  applyReconciliation,
  readBounded,
} from './ci-reconciler.js';

const repository = 'tutur3u/platform';
const sha = 'a'.repeat(40);
const controlSha = 'c'.repeat(40);
const now = Date.parse('2026-11-17T12:00:00Z');
const iso = (secondsAgo = 0) => new Date(now - secondsAgo * 1000).toISOString();
const clone = (value) => structuredClone(value);
const policy = (enabled = false) => ({
  ...clone(sourcePolicy),
  recoveryEnabled: enabled,
});
const context = { controlSha, producerRunId: 700, producerAttempt: 1 };
const gate = sourcePolicy.gates[0];
const operation = (overrides = {}) => ({
  workflow: gate.file,
  attempt: 1,
  plannedAt: iso(),
  status: 'planned',
  runId: 100,
  baselineAttempt: 1,
  ...overrides,
});
const intent = (overrides = {}) => ({
  schema: 1,
  kind: 'intent',
  repository,
  branch: 'main',
  sha,
  ...context,
  operations: [operation()],
  ...overrides,
});
const bundle = (kind, operations) => ({ ...intent(), kind, operations });
const env = (overrides = {}) => ({
  CI: 'true',
  GITHUB_REPOSITORY: repository,
  GITHUB_REF: 'refs/heads/main',
  RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_OS: 'Linux',
  GITHUB_SHA: controlSha,
  GITHUB_WORKFLOW_SHA: controlSha,
  GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/ci-reconciler.yaml@refs/heads/main`,
  GITHUB_EVENT_NAME: 'schedule',
  GITHUB_RUN_ID: '700',
  GITHUB_RUN_ATTEMPT: '1',
  RUNNER_TEMP: '/tmp/ci-reconciler-test',
  ...overrides,
});

// All provider observations and writes stay inside this in-memory router.
function fake({
  conclusion = 'success',
  missing = false,
  live = false,
  age = 3600,
  mutate,
  postThrows = false,
  receipts = [],
} = {}) {
  const events = [];
  const reads = new Map();
  let posted = false;
  const api = {
    async request(route, options = {}) {
      events.push({ route, ...clone(options) });
      const count = (reads.get(route) || 0) + 1;
      reads.set(route, count);
      const override = mutate?.({ route, count, posted });
      if (override !== undefined) return clone(override);
      if (options.method === 'POST') {
        posted = true;
        if (postThrows) throw new Error('provider unavailable');
        return null;
      }
      if (route === 'actions/workflows/ci-reconciler.yaml') {
        return { id: 900, path: '.github/workflows/ci-reconciler.yaml' };
      }
      if (route.startsWith('git/ref/heads/')) return { object: { sha } };
      if (route === `git/commits/${sha}`)
        return { sha, committer: { date: iso(age) } };
      for (const [index, item] of sourcePolicy.gates.entries()) {
        if (route === `actions/workflows/${item.file}`) {
          return {
            id: index + 1,
            path: `.github/workflows/${item.file}`,
            name: item.name,
          };
        }
        if (route.startsWith(`actions/workflows/${item.file}/runs?`)) {
          const branch = new URLSearchParams(route.split('?')[1]).get('branch');
          const runs = missing
            ? []
            : [
                {
                  id: 100 + index,
                  workflow_id: index + 1,
                  head_sha: sha,
                  head_branch: branch,
                  head_repository: { full_name: repository },
                  status: live ? 'queued' : 'completed',
                  conclusion: live ? null : conclusion,
                  run_attempt: posted ? 2 : 1,
                  created_at: iso(3600),
                  updated_at: iso(120),
                },
              ];
          return { total_count: runs.length, workflow_runs: runs };
        }
      }
      assert.fail(`Unexpected route: ${route}`);
    },
    async readReceipts(input) {
      events.push({ receipts: clone(input) });
      return clone(receipts);
    },
  };
  return { api, events };
}
const plan = (api, enabled = false) =>
  planReconciliation({
    api,
    policy: policy(enabled),
    context,
    now: () => now,
  });
async function apply(fixture, overrides = {}) {
  const saved = [];
  const result = await applyReconciliation({
    api: fixture.api,
    policy: policy(true),
    context,
    intent: intent(),
    now: () => now,
    saveResult(value) {
      saved.push(clone(value));
      fixture.events.push({ saved: clone(value) });
    },
    ...overrides,
  });
  return { result, saved };
}
const posts = (fixture) =>
  fixture.events.filter((event) => event.method === 'POST');

test('checked-in policy is read-only and refuses release workflows or extra branches', () => {
  assert.equal(validatePolicy(clone(sourcePolicy)).recoveryEnabled, false);
  for (const change of [
    (value) =>
      value.gates.push({
        file: 'release.yaml',
        name: 'Release',
        dispatch: true,
      }),
    (value) => {
      value.gates[0].file = 'release.yaml';
    },
    (value) => value.branches.push('unknown-release'),
  ]) {
    const value = policy();
    change(value);
    assert.throws(() => validatePolicy(value), /INVALID_POLICY|INVALID_GATE/);
  }
});

test('trusted main context binds the control source and producer attempt', () => {
  assert.deepEqual(trustedContext(env(), controlSha), context);
  for (const overrides of [
    { GITHUB_REPOSITORY: 'fork/platform' },
    { GITHUB_REF: 'refs/heads/production' },
    { GITHUB_WORKFLOW_SHA: sha },
    { GITHUB_SHA: sha },
    {
      GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/ci-reconciler.yaml@refs/heads/production`,
    },
  ])
    assert.throws(
      () => trustedContext(env(overrides), controlSha),
      /UNTRUSTED_CONTEXT/
    );
});

test('workflow_run is not an accepted trigger', () => {
  assert.throws(
    () =>
      trustedContext(env({ GITHUB_EVENT_NAME: 'workflow_run' }), controlSha),
    /UNTRUSTED_CONTEXT/
  );
});

test('all eight terminal failures stay terminal and remain visible in summaries', async () => {
  for (const conclusion of ['failure', 'success']) {
    const fixture = fake({ conclusion });
    const report = await plan(fixture.api);
    for (const branch of report.branches) {
      assert.equal(branch.outcomes.length, 8);
      assert.ok(
        branch.outcomes.every((item) => item.decision.kind === 'terminal')
      );
      assert.match(
        summarize(branch.branch, sha, branch.outcomes),
        /8 required, all terminal/
      );
      assert.ok(
        summarize(branch.branch, sha, branch.outcomes).includes(
          `terminal-failed=${conclusion === 'failure' ? 8 : 0}`
        )
      );
      assert.deepEqual(branch.intent.operations, []);
    }
    assert.deepEqual(posts(fixture), []);
  }
});

test('cold missing workflows produce observations without mutation intents', async () => {
  const fixture = fake({ missing: true });
  const report = await plan(fixture.api);
  assert.equal(report.branches.length, 2);
  for (const branch of report.branches) {
    assert.equal(branch.outcomes.length, 8);
    for (const { workflow, decision } of branch.outcomes) {
      if (workflow === 'turbo-unit-tests.yaml')
        assert.deepEqual(
          [decision.kind, decision.code],
          ['blocked', 'DISPATCH_UNSUPPORTED']
        );
      else
        assert.ok(
          decision.kind === 'observe' && decision.proposedAction === 'dispatch'
        );
    }
    assert.deepEqual(branch.intent.operations, []);
  }
  assert.equal(fixture.events.filter((event) => event.receipts).length, 2);
  assert.deepEqual(posts(fixture), []);
});

test('active current-head runs dedupe without reading recovery history', async () => {
  const fixture = fake({ live: true });
  const report = await plan(fixture.api, true);
  assert.ok(
    report.branches.every((branch) =>
      branch.outcomes.every(({ decision }) => decision.kind === 'dedupe')
    )
  );
  assert.ok(
    report.branches.every((branch) => branch.intent.operations.length === 0)
  );
  assert.equal(fixture.events.filter((event) => event.receipts).length, 0);
});

test('cancelled current-head runs yield bounded rerun intents when enabled', async () => {
  const fixture = fake({ conclusion: 'cancelled' });
  const report = await plan(fixture.api, true);
  for (const branch of report.branches) {
    assert.equal(branch.intent.operations.length, 8);
    assert.deepEqual(branch.intent.operations[0], operation());
    assert.equal(branch.intent.sha, sha);
  }
  assert.deepEqual(posts(fixture), []);
});

test('planning aborts when the branch advances during observation', async () => {
  const fixture = fake({
    mutate: ({ route, count }) =>
      route === 'git/ref/heads/main' && count === 2
        ? { object: { sha: 'b'.repeat(40) } }
        : undefined,
  });
  await assert.rejects(plan(fixture.api), /HEAD_ADVANCED/);
  assert.deepEqual(posts(fixture), []);
});

test('truncated or oversized run listings fail closed', async () => {
  for (const total_count of [1, 101]) {
    const fixture = fake({
      mutate: ({ route }) =>
        route.includes('/runs?')
          ? { total_count, workflow_runs: [] }
          : undefined,
    });
    await assert.rejects(plan(fixture.api), /RUN_HISTORY_INCOMPLETE/);
  }
});

test('run observations must bind workflow, repository, branch and exact head', async () => {
  for (const changes of [
    { workflow_id: 999 },
    { head_branch: 'production' },
    { head_sha: 'b'.repeat(40) },
    { head_repository: { full_name: 'fork/platform' } },
  ]) {
    const fixture = fake({
      mutate: ({ route }) =>
        route.includes('/runs?')
          ? {
              total_count: 1,
              workflow_runs: [
                {
                  workflow_id: 1,
                  head_sha: sha,
                  head_branch: 'main',
                  head_repository: { full_name: repository },
                  ...changes,
                },
              ],
            }
          : undefined,
    });
    await assert.rejects(plan(fixture.api), /RUN_IDENTITY/);
  }
});

test('receipt results require the matching prior intent identity', () => {
  const planned = operation();
  const result = { ...planned, status: 'accepted' };
  assert.deepEqual(
    mergeReceipts(
      [bundle('intent', [planned]), bundle('result', [result])],
      gate.file
    ),
    [
      {
        attempt: 1,
        plannedAt: iso(),
        status: 'accepted',
        runId: 100,
        baselineAttempt: 1,
      },
    ]
  );
  for (const changes of [
    { plannedAt: iso(1) },
    { runId: 101 },
    { baselineAttempt: 2 },
  ]) {
    assert.throws(
      () =>
        mergeReceipts(
          [
            bundle('intent', [planned]),
            bundle('result', [{ ...result, ...changes }]),
          ],
          gate.file
        ),
      /RESULT_WITHOUT_INTENT/
    );
  }
  assert.throws(
    () => mergeReceipts([bundle('result', [result])], gate.file),
    /RESULT_WITHOUT_INTENT/
  );
});

test('duplicate receipt attempts cannot create two recovery operations', () => {
  const first = bundle('intent', [operation()]);
  const second = { ...first, producerRunId: 701 };
  assert.throws(() => mergeReceipts([first, second], gate.file), /DUPLICATE/);
});

test('expired source age blocks recovery rather than restarting cold history', async () => {
  const fixture = fake({
    missing: true,
    age: sourcePolicy.maxHeadAgeSeconds + 1,
  });
  const report = await plan(fixture.api, true);
  assert.ok(
    report.branches.every((branch) =>
      branch.outcomes.every(
        ({ decision }) =>
          decision.kind === 'blocked' &&
          decision.code === 'HISTORY_WINDOW_EXPIRED'
      )
    )
  );
  assert.ok(
    report.branches.every((branch) => branch.intent.operations.length === 0)
  );
});

test('same-second dispatch readback matches the intent at GitHub timestamp precision', async () => {
  const fixture = fake({
    missing: true,
    mutate({ route, posted }) {
      if (posted && route.startsWith(`actions/workflows/${gate.file}/runs?`))
        return {
          total_count: 1,
          workflow_runs: [
            {
              id: 901,
              workflow_id: 1,
              head_sha: sha,
              head_branch: 'main',
              head_repository: { full_name: repository },
              status: 'queued',
              conclusion: null,
              run_attempt: 1,
              event: 'workflow_dispatch',
              created_at: iso(),
              updated_at: iso(),
            },
          ],
        };
    },
  });
  const report = await planReconciliation({
    api: fixture.api,
    policy: policy(true),
    context,
    now: () => now + 555,
  });
  const planned = report.branches[0].intent.operations[0];
  assert.equal(planned.plannedAt, iso());
  const { result } = await apply(fixture, {
    intent: intent({ operations: [planned] }),
    now: () => now + 555,
  });
  assert.equal(result.operations[0].status, 'accepted');
  assert.equal(result.operations[0].runId, 901);
});

test('post-apply summaries refresh current observations and count accepted recovery only', async () => {
  const fixture = fake({ live: true });
  const result = bundle('result', [
    operation({ status: 'accepted' }),
    operation({ workflow: sourcePolicy.gates[1].file, status: 'unknown' }),
  ]);
  const line = await summarizeApplied({
    api: fixture.api,
    policy: policy(),
    result,
    now: () => now,
  });
  assert.match(line, /8 required, 8 missing \(1 re-dispatched\)/);
  assert.ok(!line.includes('all terminal'));
  assert.deepEqual(posts(fixture), []);
});

test('apply persists uncertainty and rereads current head before the exact rerun POST', async () => {
  const fixture = fake({ conclusion: 'cancelled' });
  const { result } = await apply(fixture);
  assert.deepEqual(posts(fixture), [
    { route: 'actions/runs/100/rerun', method: 'POST' },
  ]);
  const postIndex = fixture.events.findIndex(
    (event) => event.method === 'POST'
  );
  assert.equal(
    fixture.events
      .slice(0, postIndex)
      .filter((event) => event.route === 'git/ref/heads/main').length,
    2
  );
  assert.equal(
    fixture.events[postIndex - 1].saved.operations[0].status,
    'unknown'
  );
  assert.equal(result.operations[0].status, 'accepted');
  assert.equal(result.operations[0].runId, 100);
});

test('an ambiguous POST remains unknown after one call and blocks the next tick', async () => {
  const fixture = fake({ conclusion: 'cancelled', postThrows: true });
  const { result } = await apply(fixture);
  assert.equal(posts(fixture).length, 1);
  assert.equal(result.operations[0].status, 'unknown');
  assert.equal(result.operations[0].code, 'WRITE_OR_READBACK_UNKNOWN');
  const next = fake({ conclusion: 'cancelled', receipts: [intent(), result] });
  const report = await plan(next.api, true);
  assert.equal(report.branches[0].outcomes[0].decision.code, 'UNKNOWN_WRITE');
  assert.deepEqual(posts(next), []);
});

test('live replan skips the stale intent without a POST', async () => {
  const fixture = fake({ live: true });
  const { result } = await apply(fixture);
  assert.equal(result.operations[0].status, 'rejected');
  assert.equal(result.operations[0].code, 'DECISION_CHANGED');
  assert.deepEqual(posts(fixture), []);
});

test('apply refuses checked-in disabled policy before provider access', async () => {
  const fixture = fake();
  await assert.rejects(
    apply(fixture, { policy: clone(sourcePolicy) }),
    /RECOVERY_DISABLED/
  );
  assert.deepEqual(fixture.events, []);
});

test('forged controls and source branches cannot reach a mutation', async () => {
  for (const changes of [
    { controlSha: sha },
    { producerRunId: 701 },
    { producerAttempt: 2 },
    { branch: 'release/unknown' },
    { repository: 'fork/platform' },
  ]) {
    const fixture = fake({ conclusion: 'cancelled' });
    await assert.rejects(
      apply(fixture, { intent: intent(changes) }),
      /INVALID_INTENT/
    );
    assert.deepEqual(posts(fixture), []);
  }
});

test('apply aborts an advancing head immediately before mutation', async () => {
  const fixture = fake({
    conclusion: 'cancelled',
    mutate: ({ route, count }) =>
      route === 'git/ref/heads/main' && count === 2
        ? { object: { sha: 'b'.repeat(40) } }
        : undefined,
  });
  await assert.rejects(apply(fixture), /HEAD_ADVANCED/);
  assert.deepEqual(posts(fixture), []);
  assert.equal(
    fixture.events.filter((event) => event.saved).at(-1).saved.operations[0]
      .status,
    'rejected'
  );
});

test('workflow metadata must match the declared gate before its runs are trusted', async () => {
  const fixture = fake({
    mutate: ({ route }) =>
      route === `actions/workflows/${gate.file}`
        ? {
            id: 1,
            path: '.github/workflows/release.yaml',
            name: gate.name,
          }
        : undefined,
  });
  await assert.rejects(plan(fixture.api), /WORKFLOW_IDENTITY/);
  assert.deepEqual(posts(fixture), []);
});

test('readBounded parses only a bounded regular file it opened itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-reconciler-read-'));
  try {
    const file = path.join(dir, 'receipt.json');
    fs.writeFileSync(file, JSON.stringify({ schema: 1 }));
    assert.deepEqual(readBounded(file), { schema: 1 });

    const link = path.join(dir, 'link.json');
    fs.symlinkSync(file, link);
    assert.throws(() => readBounded(link), { code: 'FILE_BOUND' });
    assert.throws(() => readBounded(dir), { code: 'FILE_BOUND' });
    const fifo = path.join(dir, 'fifo.json');
    execFileSync('mkfifo', [fifo]);
    assert.throws(() => readBounded(fifo), { code: 'FILE_BOUND' });

    fs.writeFileSync(file, '');
    assert.throws(() => readBounded(file), { code: 'FILE_BOUND' });
    fs.writeFileSync(file, `"${'x'.repeat(262144)}"`);
    assert.throws(() => readBounded(file), { code: 'FILE_BOUND' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
