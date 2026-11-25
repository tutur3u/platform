// The automatic wave-1 production publishers are unreachable unless the
// production-policy job admits them: the caller jobs that inherit every
// secret, and the called publisher's credential-bearing jobs. Each job
// condition is evaluated across refs, events, policy outcomes and the other
// gates it depends on.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const READY = 'ready-for-ci';
const refs = ['refs/heads/production', 'refs/heads/main', 'refs/pull/1/merge'];
const events = ['push', 'workflow_dispatch', 'pull_request'];
const policyOutcomes = [
  { result: 'success', allowed: 'true' },
  { result: 'success', allowed: 'false' },
  { result: 'success', allowed: '' },
  { result: 'failure', allowed: undefined },
  { result: 'skipped', allowed: undefined },
];

function evaluate(condition, scope) {
  const source = String(condition)
    .trim()
    .replace(/^\$\{\{\s*/u, '')
    .replace(/\s*\}\}$/u, '')
    .replaceAll('labels.*.name', 'labelNames')
    .replace(/needs\.([\w-]+)/gu, 'needs["$1"]');
  return Boolean(
    vm.runInNewContext(
      source,
      {
        ...scope,
        contains: (items, item) => items.includes(item),
        startsWith: (value, prefix) => value.startsWith(prefix),
        cancelled: () => false,
        always: () => true,
        success: () => true,
      },
      { timeout: 100 }
    )
  );
}

function scope({ ref, event, policy, gates = {}, inputs = {} }) {
  const outcome = (result) => ({ result, outputs: {} });
  return {
    github: {
      ref,
      event_name: event,
      event: { pull_request: { labelNames: [READY], draft: false } },
    },
    inputs,
    needs: {
      'affected-gate': { result: 'success', outputs: { run: 'true' } },
      'check-ci': {
        result: 'success',
        outputs: { should_run: gates.shouldRun ?? 'true' },
      },
      'restore-acceptance': outcome(gates.restore ?? 'success'),
      'release-admission': outcome(gates.releaseAdmission ?? 'skipped'),
      qualify: outcome(gates.qualify ?? 'success'),
      restored: outcome(gates.restored ?? 'success'),
      'production-policy': {
        result: policy.result,
        outputs: { allowed: policy.allowed },
      },
    },
  };
}

function* matrix() {
  for (const ref of refs)
    for (const event of events)
      for (const policy of policyOutcomes) yield { ref, event, policy };
}

const productionEvent = ({ ref, event }) =>
  ref === 'refs/heads/production' &&
  (event === 'push' || event === 'workflow_dispatch');

for (const app of ['mail', 'calendar', 'apps']) {
  const workflow = readWorkflow(`${app}-cloudflare.yaml`);
  const publish = workflow.jobs['native-publish-production'];
  const policyJob = workflow.jobs['production-policy'];

  test(`${app}: the inheriting caller runs only after production-policy admits`, () => {
    assert.equal(publish.secrets, 'inherit');
    assert.ok([publish.needs].flat().includes('production-policy'));
    assert.equal(
      publish.uses,
      './.github/workflows/wave1-native-production.yaml'
    );
    for (const cell of matrix()) {
      for (const shouldRun of ['true', 'false']) {
        for (const restore of ['success', 'failure']) {
          const reachable = evaluate(
            publish.if,
            scope({ ...cell, gates: { shouldRun, restore } })
          );
          const expected =
            productionEvent(cell) &&
            cell.policy.allowed === 'true' &&
            shouldRun === 'true' &&
            (app !== 'apps' || restore === 'success');
          assert.equal(
            reachable,
            expected,
            `${cell.ref} ${cell.event} ${JSON.stringify(cell.policy)} should_run=${shouldRun} restore=${restore}`
          );
        }
      }
    }
  });

  test(`${app}: the policy job holds no credential and asks for automatic admission`, () => {
    assert.equal(policyJob.secrets, undefined);
    assert.deepEqual(policyJob.permissions, { contents: 'read' });
    assert.doesNotMatch(JSON.stringify(policyJob), /secrets[.[]/u);
    assert.match(
      policyJob.steps.find(({ id }) => id === 'policy').run,
      /--automatic$/u
    );
    for (const cell of matrix())
      assert.equal(
        evaluate(policyJob.if, scope(cell)),
        productionEvent(cell),
        `${cell.ref} ${cell.event}`
      );
  });
}

test('the called publisher reaches credentials only after admission', () => {
  const publisher = readWorkflow('wave1-native-production.yaml');
  // A planner call passes only the app: never a release artifact.
  const inputs = { app: 'mail' };
  for (const cell of matrix()) {
    const admitted =
      cell.ref === 'refs/heads/production' && cell.policy.allowed === 'true';
    assert.equal(
      evaluate(publisher.jobs.qualify.if, scope({ ...cell, inputs })),
      admitted,
      `qualify ${cell.ref} ${cell.event} ${JSON.stringify(cell.policy)}`
    );
    for (const [qualify, restored] of [
      ['success', 'success'],
      ['failure', 'skipped'],
      ['success', 'failure'],
    ]) {
      assert.equal(
        evaluate(
          publisher.jobs.publish.if,
          scope({ ...cell, inputs, gates: { qualify, restored } })
        ),
        admitted &&
          cell.policy.result === 'success' &&
          qualify === 'success' &&
          restored === 'success',
        `publish ${cell.ref} ${cell.event} ${JSON.stringify(cell.policy)} ${qualify}/${restored}`
      );
    }
  }
  // Every job that names a secret waits for an admission job.
  for (const [id, job] of Object.entries(publisher.jobs)) {
    if (!/secrets[.[]/u.test(JSON.stringify(job))) continue;
    const needs = [job.needs].flat();
    assert.ok(
      needs.includes('production-policy') || needs.includes('qualify'),
      `${id} reads secrets without waiting for admission`
    );
  }
});

test('the reachability matrix detects a publisher that ignores admission', () => {
  const { if: condition } = readWorkflow('mail-cloudflare.yaml').jobs[
    'native-publish-production'
  ];
  const ungated = condition.replace(
    " && needs.production-policy.outputs.allowed == 'true'",
    ''
  );
  assert.notEqual(ungated, condition);
  const leaks = [...matrix()].filter(
    (cell) => cell.policy.allowed !== 'true' && evaluate(ungated, scope(cell))
  );
  assert.ok(leaks.length > 0, 'an ungated publisher must be reachable');
});
