const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('auto-ready-for-ci.yaml', { raw: true });
const job = workflow.jobs.label;
const script = job.steps[1].with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

async function exercise(overrides = {}, action = 'opened') {
  const repo = { id: 17, full_name: 'tutur3u/platform' };
  const pr = {
    number: 42,
    state: 'open',
    draft: false,
    head: { repo },
    base: { repo },
    labels: [],
    ...overrides,
  };
  const labels = [];
  const context = {
    repo: { owner: 'tutur3u', repo: 'platform' },
    issue: { number: 42 },
    payload: { action },
  };
  const github = {
    rest: {
      pulls: { get: async () => ({ data: pr }) },
      issues: { addLabels: async (request) => labels.push(request) },
    },
  };
  await new AsyncFunction('github', 'context', script)(github, context);
  return labels;
}

test('opened and ready-for-review admit the current same-repo non-draft PR', async () => {
  for (const action of ['opened', 'ready_for_review']) {
    assert.deepEqual(await exercise({}, action), [
      {
        owner: 'tutur3u',
        repo: 'platform',
        issue_number: 42,
        labels: ['ready-for-ci'],
      },
    ]);
  }
});

test('live metadata refuses drafts, closed PRs, forks, deleted repos and lookalikes', async () => {
  for (const override of [
    { draft: true },
    { state: 'closed' },
    { head: { repo: null } },
    { head: { repo: { id: 99, full_name: 'fork/platform' } } },
    { head: { repo: { id: 99, full_name: 'tutur3u/platform' } } },
    { base: { repo: { id: 17, full_name: 'other/platform' } } },
  ])
    assert.deepEqual(await exercise(override), []);
});

test('existing labels and unrelated events create no duplicate admission event', async () => {
  assert.deepEqual(await exercise({ labels: [{ name: 'ready-for-ci' }] }), []);
  assert.deepEqual(await exercise({}, 'synchronize'), []);
});

test('trusted workflow uses hosted metadata only and no token fallback', () => {
  assert.deepEqual(workflow.on, {
    pull_request_target: { types: ['opened', 'ready_for_review'] },
  });
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(job.permissions, {});
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job['timeout-minutes'], 2);
  assert.match(job.if, /draft == false/);
  assert.match(
    job.if,
    /head\.repo\.id == github\.event\.pull_request\.base\.repo\.id/
  );
  assert.match(job.if, /head\.repo\.full_name == github\.repository/);
  assert.match(job.steps[0].run, /-z "\$CI_ADMISSION_TOKEN"/);
  assert.match(job.steps[0].run, /exit 1/);
  assert.doesNotMatch(
    JSON.stringify(job.steps),
    /checkout@|persist-credentials|\|\| github\.token/
  );
  assert.ok(
    require('./pr-label-gate').ADMISSION_PR_WORKFLOWS.includes(
      'auto-ready-for-ci.yaml'
    )
  );
  assert.equal(job.steps.length, 2);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.equal(workflow.concurrency.queue, undefined);
  assert.match(job.steps[1].uses, /^actions\/github-script@[0-9a-f]{40}/);
});
