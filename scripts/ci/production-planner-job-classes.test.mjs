import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyPlannerJobs,
  heldAppSummary,
  plannerCaller,
  PLANNER_JOB_CLASSES,
} from './production-planner-job-classes.mjs';

const plannerSource = readFileSync(
  new URL('../../.github/workflows/vercel-production.yaml', import.meta.url),
  'utf8'
);
const moduleUrl = new URL('./production-planner-job-classes.mjs', import.meta.url);

function jobs(overrides = {}, remove = []) {
  const base = {
    plan: 'success',
    'deploy-platform / Deploy-Production': 'success',
    'deploy-colab-cloudflare / deploy': 'success',
    'deploy-meet-cloudflare / validate': 'success',
    'deploy-meet-cloudflare / deploy': 'success',
    'deploy-parley-cloudflare / deploy': 'success',
    'deploy-mail': 'skipped',
    ...overrides,
  };
  for (const name of remove) delete base[name];
  return Object.entries(base).map(([name, conclusion], index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion,
  }));
}

const accepted = [
  ['all jobs succeed', 'success', jobs()],
  [
    'one independent app failed',
    'failure',
    jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }),
  ],
  [
    'independent app validation failed and its deploy skipped',
    'failure',
    jobs({
      'deploy-parley-cloudflare / validate': 'failure',
      'deploy-parley-cloudflare / deploy': 'skipped',
    }),
  ],
  [
    'independent apps cancelled or timed out',
    'failure',
    jobs({
      'deploy-meet-cloudflare / deploy': 'cancelled',
      'deploy-parley-cloudflare / deploy': 'timed_out',
    }),
  ],
];
const rejected = [
  ['platform failed', 'failure', jobs({ 'deploy-platform / Deploy-Production': 'failure' })],
  ['control plane failed', 'failure', jobs({ 'deploy-colab-cloudflare / deploy': 'failure' })],
  ['plan failed', 'failure', jobs({ plan: 'failure' })],
  ['platform cancelled', 'failure', jobs({ 'deploy-platform / Deploy-Production': 'cancelled' })],
  ['platform skipped', 'failure', jobs({ 'deploy-platform / Deploy-Production': 'skipped', 'deploy-meet-cloudflare / deploy': 'failure' })],
  ['platform job missing', 'failure', jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }, ['deploy-platform / Deploy-Production'])],
  ['plan job missing', 'failure', jobs({ 'deploy-meet-cloudflare / deploy': 'failure' }, ['plan'])],
  ['unknown caller', 'failure', jobs({ 'deploy-surprise / deploy': 'failure' })],
  ['unknown caller that succeeded', 'success', jobs({ 'deploy-surprise / deploy': 'success' })],
  ['renamed caller', 'failure', jobs({ 'deploy-meet-cloudflare-v2 / deploy': 'failure' })],
  ['unparseable name', 'failure', jobs({ 'Deploy Meet': 'failure' })],
  ['unknown conclusion', 'failure', jobs({ 'deploy-meet-cloudflare / deploy': 'action_required' })],
  ['null conclusion', 'failure', jobs({ 'deploy-meet-cloudflare / deploy': null })],
  ['success planner with a failed app', 'success', jobs({ 'deploy-meet-cloudflare / deploy': 'failure' })],
  ['failed planner with no failed job', 'failure', jobs()],
  ['cancelled planner', 'cancelled', jobs()],
  ['unfinished planner', null, jobs()],
  ['no jobs', 'failure', []],
  ['control plane neutral', 'failure', jobs({ 'deploy-colab-cloudflare / deploy': 'neutral', 'deploy-meet-cloudflare / deploy': 'failure' })],
];

test('every accepted planner shape is admitted', () => {
  for (const [label, conclusion, list] of accepted) {
    const result = classifyPlannerJobs(list, conclusion);
    assert.equal(result.ok, true, label);
  }
});

test('every unsafe planner shape fails closed', () => {
  for (const [label, conclusion, list] of rejected) {
    const result = classifyPlannerJobs(list, conclusion);
    assert.equal(result.ok, false, label);
    assert.deepEqual(result.held, [], label);
  }
});

test('non terminal and duplicate jobs fail closed', () => {
  const running = jobs({ 'deploy-meet-cloudflare / deploy': 'failure' });
  running[0].status = 'in_progress';
  assert.equal(classifyPlannerJobs(running, 'failure').ok, false);
  const duplicate = jobs({ 'deploy-meet-cloudflare / deploy': 'failure' });
  duplicate.push({ ...duplicate[0], id: 99 });
  assert.equal(classifyPlannerJobs(duplicate, 'failure').ok, false);
});

test('held apps list names, jobs and conclusions only', () => {
  const result = classifyPlannerJobs(
    jobs({
      'deploy-meet-cloudflare / deploy': 'failure',
      'deploy-parley-cloudflare / deploy': 'cancelled',
    }),
    'failure'
  );
  assert.deepEqual(
    result.held.map((entry) => entry.app),
    ['deploy-meet-cloudflare', 'deploy-parley-cloudflare']
  );
  const summary = heldAppSummary(result.held);
  assert.match(summary, /deploy-meet-cloudflare: deploy-meet-cloudflare \/ deploy failure/);
  assert.match(summary, /deploy-parley-cloudflare: deploy-parley-cloudflare \/ deploy cancelled/);
  assert.equal(summary.split('\n').length, 3);
});

test('caller ids parse bare skipped and nested job names', () => {
  assert.deepEqual(plannerCaller('deploy-ai'), { caller: 'deploy-ai', nested: null });
  assert.deepEqual(plannerCaller('deploy-apps-native / native-profiles / build (production)'), {
    caller: 'deploy-apps-native',
    nested: 'native-profiles / build (production)',
  });
  assert.equal(plannerCaller('Deploy-ai'), null);
  assert.equal(plannerCaller('deploy-ai /'), null);
});

test('class table lists exactly the planner caller jobs', () => {
  const callers = [...plannerSource.matchAll(/^ {2}([a-z0-9-]+):$/gm)]
    .map((match) => match[1])
    .filter((name) => name === 'plan' || name.startsWith('deploy-'));
  assert.deepEqual(Object.keys(PLANNER_JOB_CLASSES).sort(), callers.sort());
  assert.equal(PLANNER_JOB_CLASSES['deploy-platform'], 'platform-required');
  assert.equal(PLANNER_JOB_CLASSES.plan, 'control-plane-required');
});

// Deliberate mutation negatives: each variant removes one gate and must let at
// least one of the unsafe shapes through, proving the table above detects it.
const mutations = [
  [
    'required failed gate removed',
    "if (kind !== INDEPENDENT_APP) return reject('required-job-failed');",
  ],
  [
    'unclassified gate removed',
    "if (!kind) return reject('planner-job-unclassified');",
  ],
  [
    'required jobs gate removed',
    "return reject('required-job-missing-or-unsuccessful');",
  ],
  [
    'inconsistent conclusion gate removed',
    "return reject('planner-conclusion-inconsistent');",
  ],
];
for (const [label, line] of mutations) {
  test(`mutation negative: ${label}`, async () => {
    assert.ok(plannerSource.length > 0 && readFileSync(moduleUrl, 'utf8').includes(line), label);
    const source = readFileSync(moduleUrl, 'utf8').replace(
      line,
      line.startsWith('if (') ? '' : 'void 0;'
    );
    const mutated = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    );
    const escaped = rejected.filter(
      ([, conclusion, list]) => mutated.classifyPlannerJobs(list, conclusion).ok
    );
    assert.ok(escaped.length > 0, `${label} escaped no unsafe shape`);
  });
}
