const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('auto-ready-for-ci.yaml', { raw: true });
const job = workflow.jobs.label;
const labelStep = job.steps.find((step) =>
  step.uses?.startsWith('actions/github-script@')
);
const appTokenStep = job.steps.find((step) => step.id === 'app-token');
const configurationStep = job.steps.find((step) => step.run);
const script = labelStep.with.script;
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
  assert.deepEqual(configurationStep.env, {
    CI_ADMISSION_APP_ID: '${{ vars.CI_ADMISSION_APP_ID }}',
    CI_ADMISSION_APP_PRIVATE_KEY: '${{ secrets.CI_ADMISSION_APP_PRIVATE_KEY }}',
  });
  assert.equal(configurationStep.shell, 'bash');
  assert.match(configurationStep.run, /-z "\$CI_ADMISSION_APP_ID"/);
  assert.match(configurationStep.run, /-z "\$CI_ADMISSION_APP_PRIVATE_KEY"/);
  assert.match(configurationStep.run, /::error::/);
  assert.match(configurationStep.run, /exit 1/);
  assert.equal(
    appTokenStep.uses,
    'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510'
  );
  assert.deepEqual(appTokenStep.with, {
    'app-id': '${{ vars.CI_ADMISSION_APP_ID }}',
    'private-key': '${{ secrets.CI_ADMISSION_APP_PRIVATE_KEY }}',
    owner: 'tutur3u',
    repositories: 'platform',
    'permission-issues': 'write',
    'permission-pull-requests': 'read',
  });
  assert.equal(appTokenStep.with['skip-token-revoke'], undefined);
  assert.equal(
    labelStep.with['github-token'],
    '${{ steps.app-token.outputs.token }}'
  );
  assert.equal(job.steps.indexOf(configurationStep), 0);
  assert.equal(job.steps.indexOf(appTokenStep), 1);
  assert.equal(job.steps.indexOf(labelStep), 2);
  assert.doesNotMatch(
    JSON.stringify(job.steps),
    /checkout@|persist-credentials|CI_ADMISSION_TOKEN|\|\| github\.token/
  );
  assert.ok(
    require('./pr-label-gate').ADMISSION_PR_WORKFLOWS.includes(
      'auto-ready-for-ci.yaml'
    )
  );
  assert.equal(job.steps.length, 3);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.equal(workflow.concurrency.queue, undefined);
  assert.match(labelStep.uses, /^actions\/github-script@[0-9a-f]{40}/);
});

test('missing App configuration fails closed without exposing supplied values', () => {
  for (const env of [
    {},
    { CI_ADMISSION_APP_ID: '123' },
    { CI_ADMISSION_APP_PRIVATE_KEY: 'synthetic-private-key' },
  ]) {
    const result = spawnSync('bash', ['-e', '-c', configurationStep.run], {
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::CI_ADMISSION_APP_(ID|PRIVATE_KEY)/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-key/);
  }
  const result = spawnSync('bash', ['-e', '-c', configurationStep.run], {
    env: {
      CI_ADMISSION_APP_ID: '123',
      CI_ADMISSION_APP_PRIVATE_KEY: 'synthetic-private-key',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout + result.stderr, '');
});
