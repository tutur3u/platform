import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlan,
  RANGE_NOT_COMPUTED,
  request,
  uncomputedRange,
} from './ci-register.mjs';
import { compare } from './ci-shadow-report.mjs';
import { SUPERSEDING_MAIN_WORKFLOWS } from './main-supersession.mjs';

const SHA = 'a'.repeat(40);

test('workflows real CI diffs from another commit are marked, not decided', () => {
  assert.equal(
    uncomputedRange('meet-cloudflare.yaml', []),
    'deployment marker'
  );
  assert.equal(
    uncomputedRange('type-check.yaml', SUPERSEDING_MAIN_WORKFLOWS),
    'last green main run'
  );
  assert.equal(
    uncomputedRange('oxc-check.yaml', SUPERSEDING_MAIN_WORKFLOWS),
    null
  );
  const decided = [];
  const plan = buildPlan({
    workflows: [
      { file: 'meet-cloudflare.yaml', paths: [], ignore: [] },
      { file: 'type-check.yaml', paths: [], ignore: [] },
      { file: 'oxc-check.yaml', paths: [], ignore: [] },
    ],
    files: ['docs/readme.md'],
    superseding: SUPERSEDING_MAIN_WORKFLOWS,
    decide: (file) => {
      decided.push(file);
      return { shouldRun: false, reason: 'not affected' };
    },
  });
  assert.deepEqual(decided, ['oxc-check.yaml']);
  assert.deepEqual(plan.slice(0, 2), [
    {
      workflow: 'meet-cloudflare.yaml',
      run: true,
      reason: `${RANGE_NOT_COMPUTED}deployment marker`,
    },
    {
      workflow: 'type-check.yaml',
      run: true,
      reason: `${RANGE_NOT_COMPUTED}last green main run`,
    },
  ]);
});

test('the report counts a range-not-computed entry as neither saved nor missed', () => {
  const registration = {
    sha: SHA,
    plan: [
      {
        workflow: 'meet-cloudflare.yaml',
        run: true,
        reason: `${RANGE_NOT_COMPUTED}deployment marker`,
      },
    ],
  };
  // GitHub never started it: a decided `run: true` would count as missed.
  const report = compare([registration], new Map([[SHA, []]]));
  assert.equal(report.summary.saved, 0);
  assert.equal(report.summary.missed, 0);
});

test('deliberate coordinator answers are final and never retried', async () => {
  for (const error of ['CI_OFF', 'COORDINATOR_OFF', 'STOPPED']) {
    let calls = 0;
    const slept = [];
    const fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error }), { status: 503 });
    };
    const answer = await request(fetch, async (ms) => slept.push(ms), 'u', {});
    assert.equal(answer.status, 503, error);
    assert.equal(calls, 1, error);
    assert.deepEqual(slept, [], error);
  }
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'INTERNAL' }), { status: 503 });
  };
  await request(fetch, async () => {}, 'u', {});
  assert.equal(calls, 3);
});
