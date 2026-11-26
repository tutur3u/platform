import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  gateDecision,
  pipelineStates,
  settledPipelines,
  isRed,
  readReceipts,
  render,
  summarize,
  verdict,
} from './fleet-freshness.mjs';
import { PRODUCTION_FLEET } from './production-fleet.mjs';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const base = {
  sha: SHA,
  mode: 'publish',
  scope: 'all',
  today: '2026-11-25',
  equivalent: () => false,
};
const auto = { class: 'auto', identity: 'https://x/api/build-info' };
const special = {
  class: 'special',
  publisher: 'p',
  identity: 'https://y/api/build-info',
  workflow: 'y.yaml',
};

test('auto apps: fresh, stale, failed, rehearsed and out of scope', () => {
  assert.equal(verdict('a', auto, { ...base, live: SHA }).verdict, 'FRESH');
  assert.equal(verdict('a', auto, { ...base, live: OLD }).verdict, 'STALE');
  assert.equal(verdict('a', auto, { ...base, live: null }).verdict, 'UNKNOWN');
  assert.equal(
    verdict('a', auto, {
      ...base,
      live: OLD,
      receipt: { outcome: 'failed', steps: [{ message: 'smoke failed' }] },
    }).verdict,
    'FAILED'
  );
  assert.equal(
    verdict('a', auto, {
      ...base,
      live: OLD,
      mode: 'rehearse',
      receipt: { outcome: 'rehearsed', version: 'v' },
    }).verdict,
    'REHEARSED'
  );
  assert.equal(
    verdict('a', auto, { ...base, live: OLD, scope: 'b' }).verdict,
    'NOT-IN-SCOPE'
  );
  assert.equal(
    verdict('a', auto, { ...base, live: OLD, mode: 'rehearse' }).verdict,
    'NOT-IN-SCOPE'
  );
});

test('special apps use the planner equivalence for older builds', () => {
  assert.equal(verdict('s', special, { ...base, live: OLD }).verdict, 'STALE');
  assert.equal(
    verdict('s', special, { ...base, live: OLD, equivalent: () => true })
      .verdict,
    'FRESH-EQUIVALENT'
  );
  assert.equal(
    verdict('s', { ...special, identity: null }, { ...base, live: null })
      .verdict,
    'UNVERIFIED'
  );
});

test('manual apps turn red after their until date; holds never do', () => {
  const manual = { class: 'manual', slice: 'S1', until: '2026-11-27' };
  assert.equal(verdict('m', manual, { ...base, live: OLD }).verdict, 'MANUAL');
  assert.equal(
    verdict('m', manual, { ...base, live: OLD, today: '2026-11-28' }).verdict,
    'EXPIRED'
  );
  const held = verdict(
    'h',
    { class: 'held', reason: 'r', owner: 'o' },
    { ...base, live: OLD }
  );
  assert.equal(held.verdict, 'HELD');
  assert.match(held.reason, /held by policy/);
  assert.equal(isRed(held), false);
});

test('a whole-fleet summary is red when a serving app is left stale', async () => {
  const rows = await summarize(
    SHA,
    {},
    {
      ...base,
      readIdentity: async (url) => (url.includes('learn') ? OLD : SHA),
    }
  );
  assert.equal(rows.length, Object.keys(PRODUCTION_FLEET).length);
  const learn = rows.find((row) => row.app === 'learn');
  assert.equal(learn.verdict, 'STALE');
  assert.match(render(SHA, rows), /RED: .*learn/);
  assert.equal(rows.find((row) => row.app === 'lettin').verdict, 'HELD');
});

test('receipts are read from nested artifact folders', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fleet-receipts-'));
  mkdirSync(path.join(dir, 'serving-learn-publication-x'));
  writeFileSync(
    path.join(
      dir,
      'serving-learn-publication-x',
      'learn-serving-publication.json'
    ),
    JSON.stringify({ app: 'learn', outcome: 'published' })
  );
  assert.equal(readReceipts(dir).learn.outcome, 'published');
  assert.deepEqual(readReceipts(path.join(dir, 'missing')), {});
});

test('the gate blocks after an unacknowledged red round', () => {
  assert.deepEqual(gateDecision([], ''), { allowed: true, run: null });
  assert.equal(gateDecision([{ id: 1, summary: 'success' }], '').allowed, true);
  assert.equal(
    gateDecision([{ id: 2, summary: 'failure' }], '').allowed,
    false
  );
  assert.equal(
    gateDecision([{ id: 2, summary: 'failure' }], '2').allowed,
    true
  );
  assert.equal(
    gateDecision([{ id: 2, summary: 'failure' }], '1').allowed,
    false
  );
  // A blocked run without a summary does not hide the red one before it.
  assert.equal(
    gateDecision(
      [
        { id: 3, summary: null },
        { id: 2, summary: 'failure' },
      ],
      ''
    ).allowed,
    false
  );
});

test('a re-run keeps the latest attempt receipt per app', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fleet-attempts-'));
  for (const [attempt, outcome] of [
    [2, 'published'],
    [1, 'failed'],
  ]) {
    const folder = path.join(dir, `serving-nova-publication-x-${attempt}`);
    mkdirSync(folder);
    writeFileSync(
      path.join(folder, 'nova-serving-publication.json'),
      JSON.stringify({
        app: 'nova',
        outcome,
        run: { attempt: String(attempt) },
      })
    );
  }
  assert.equal(readReceipts(dir).nova.outcome, 'published');
});

test('a running special pipeline is pending only while young after a good run', () => {
  const tasks = { ...special, pipeline: 'vercel-production.yaml' };
  const at = (state) =>
    verdict('tasks', tasks, {
      ...base,
      live: OLD,
      running: new Map([['vercel-production.yaml', state]]),
    });
  const pending = at({ ageMinutes: 12, previous: 'success' });
  assert.equal(pending.verdict, 'PENDING');
  assert.equal(isRed(pending), false);
  // Stuck, or the previous production run did not succeed: red.
  assert.equal(isRed(at({ ageMinutes: 90, previous: 'success' })), true);
  assert.equal(isRed(at({ ageMinutes: 12, previous: 'failure' })), true);
  assert.equal(at({ ageMinutes: 12, previous: null }).verdict, 'UNKNOWN');
  // The 45-minute limit is inclusive.
  assert.equal(at({ ageMinutes: 45, previous: 'success' }).verdict, 'PENDING');
  assert.equal(at({ ageMinutes: 46, previous: 'success' }).verdict, 'UNKNOWN');
  assert.equal(
    verdict('tasks', tasks, { ...base, live: OLD }).verdict,
    'STALE'
  );
});

test('restore failures are RED even when the target SHA is serving', () => {
  const row = verdict('a', auto, {
    ...base,
    live: SHA,
    receipt: {
      outcome: 'failed',
      steps: [{ step: 'restore-failed', message: 'restore lost its fence' }],
    },
  });
  assert.equal(row.verdict, 'FAILED');
  assert.equal(isRed(row), true);
  assert.equal(row.reason, 'restore lost its fence');
});

test('coordinator skips are distinct from stale and failed builds are RED', () => {
  const skipped = verdict('a', auto, {
    ...base,
    live: OLD,
    receipt: { outcome: 'coordinator-skipped' },
  });
  assert.equal(skipped.verdict, 'COORDINATOR-SKIPPED');
  assert.equal(isRed(skipped), false);
  const failed = verdict('a', auto, {
    ...base,
    live: OLD,
    buildFailure: 'failure',
  });
  assert.equal(failed.verdict, 'FAILED');
  assert.equal(isRed(failed), true);
});

test('serving the SHA wins over an earlier failed receipt', () => {
  const row = verdict('a', auto, {
    ...base,
    live: SHA,
    receipt: { outcome: 'failed', steps: [{ message: 'smoke failed' }] },
  });
  assert.equal(row.verdict, 'FRESH');
  assert.match(row.reason, /earlier failed attempt/);
});

test('a timed-out or cancelled summary blocks like a failure; skipped passes over', () => {
  for (const summary of ['cancelled', 'timed_out'])
    assert.equal(gateDecision([{ id: 4, summary }], '').allowed, false);
  assert.equal(
    gateDecision(
      [
        { id: 5, summary: 'skipped' },
        { id: 4, summary: 'timed_out' },
      ],
      '4'
    ).allowed,
    true
  );
});

/** Fake Actions API: vercel-production runs for the SHA until `doneAt`. */
function actions({ doneAt = Infinity, previous = 'success' } = {}) {
  let clock = 0;
  const get = async (route) => {
    if (route.startsWith('runs?head_sha='))
      return {
        workflow_runs: [
          {
            path: '.github/workflows/vercel-production.yaml',
            status: clock >= doneAt ? 'completed' : 'in_progress',
            run_started_at: new Date(0).toISOString(),
          },
          { path: '.github/workflows/other.yaml', status: 'in_progress' },
        ],
      };
    if (route.startsWith('workflows/vercel-production.yaml/runs'))
      return { workflow_runs: [{ conclusion: previous }] };
    throw new Error(`unexpected ${route}`);
  };
  return {
    get,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
}

test('pipeline states cover only watched, running pipelines', async () => {
  const { get } = actions();
  const states = await pipelineStates(
    get,
    SHA,
    new Set(['vercel-production.yaml']),
    30 * 60_000
  );
  assert.deepEqual([...states.keys()], ['vercel-production.yaml']);
  assert.equal(states.get('vercel-production.yaml').ageMinutes, 30);
  assert.equal(states.get('vercel-production.yaml').previous, 'success');
});

test('the wait ends when the pipeline finishes, or at the deadline', async () => {
  const watched = new Set(['vercel-production.yaml']);
  const finishing = actions({ doneAt: 3 * 60_000 });
  assert.equal(
    (await settledPipelines(finishing.get, SHA, watched, finishing)).size,
    0
  );
  const stuck = actions();
  const states = await settledPipelines(stuck.get, SHA, watched, {
    ...stuck,
    waitMinutes: 10,
  });
  assert.equal(states.size, 1);
  assert.ok(stuck.now() <= 11 * 60_000);
});
