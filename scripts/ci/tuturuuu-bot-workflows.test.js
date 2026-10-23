const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

function appMintJobs(workflows) {
  return Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs || {}).flatMap(([id, job]) =>
      (job.steps || [])
        .filter(
          (step) =>
            step.uses?.startsWith('actions/create-github-app-token@') &&
            String(step.with?.['private-key']).includes(
              'TUTURUUU_BOT_PRIVATE_KEY'
            )
        )
        .map((step) => ({ file, id, workflow, job, step }))
    )
  );
}

function validateMint({ workflow, job, step }) {
  assert.match(step.uses, /^actions\/create-github-app-token@[a-f0-9]{40}$/);
  assert.ok(
    Object.keys(workflow.on).every((event) =>
      ['push', 'schedule', 'workflow_dispatch'].includes(event)
    )
  );
  assert.equal(
    typeof job.environment === 'string'
      ? job.environment
      : job.environment?.name,
    'tuturuuu-bot'
  );
  assert.match(step.if, /github.repository == 'tutur3u\/platform'/);
  assert.match(step.if, /github.ref == 'refs\/heads\/(main|production)'/);
  assert.doesNotMatch(
    JSON.stringify(job),
    /github.event.pull_request|github.head_ref/
  );
  for (const checkout of job.steps.filter((item) =>
    item.uses?.startsWith('actions/checkout@')
  )) {
    assert.ok([undefined, 'main', 'production'].includes(checkout.with?.ref));
    assert.ok(
      [undefined, 'tutur3u/platform'].includes(checkout.with?.repository)
    );
  }
  assert.equal(step.with.owner, 'tutur3u');
  assert.equal(step.with.repositories, 'platform');
  const scopes = Object.entries(step.with).filter(([key]) =>
    key.startsWith('permission-')
  );
  assert.ok(scopes.length > 0);
  for (const [key, value] of scopes) {
    assert.ok(
      ['permission-contents', 'permission-pull-requests'].includes(key)
    );
    assert.ok(['read', 'write'].includes(value));
  }
  assert.ok(![true, 'true'].includes(step.with['skip-token-revoke']));
  for (const consumer of job.steps.filter((item) => item !== step)) {
    assert.doesNotMatch(
      JSON.stringify(consumer),
      /secrets.TUTURUUU_BOT_PRIVATE_KEY/
    );
  }
}

test('only jobs minting this App token are subject to the App trust policy', () => {
  for (const mint of appMintJobs(readAllWorkflows())) validateMint(mint);
});

test('unrelated workflow changes do not participate in App policy or inventory equality', () => {
  assert.deepEqual(
    appMintJobs({
      unrelated: {
        on: { pull_request: {} },
        jobs: {
          comments: {
            permissions: { 'pull-requests': 'write' },
            steps: [{ run: 'changed by another PR' }],
          },
        },
      },
    }),
    []
  );
});

test('any future App mint job requires pinned action, protected environment, trusted triggers and narrow scope', () => {
  const fixture = {
    workflow: { on: { push: {} } },
    job: { environment: 'tuturuuu-bot', steps: [] },
    step: {
      uses: `actions/create-github-app-token@${'a'.repeat(40)}`,
      if: "github.repository == 'tutur3u/platform' && github.ref == 'refs/heads/main'",
      with: {
        owner: 'tutur3u',
        repositories: 'platform',
        'permission-contents': 'write',
      },
    },
  };
  validateMint(fixture);
  for (const mutate of [
    (f) => {
      f.step.uses = 'actions/create-github-app-token@v2';
    },
    (f) => {
      delete f.job.environment;
    },
    (f) => {
      f.job.environment = 'arbitrary';
    },
    (f) => {
      f.job.steps.push({
        uses: 'actions/checkout@sha',
        with: { ref: 'untrusted-branch' },
      });
    },
    (f) => {
      f.workflow.on.pull_request = {};
    },
    (f) => {
      f.workflow.on.pull_request_target = {};
    },
    (f) => {
      f.step.if = 'always()';
    },
    (f) => {
      f.step.with['permission-actions'] = 'write';
    },
    (f) => {
      f.step.with['permission-workflows'] = 'write';
    },
    (f) => {
      f.step.with['skip-token-revoke'] = 'true';
    },
  ]) {
    const bad = structuredClone(fixture);
    mutate(bad);
    assert.throws(() => validateMint(bad));
  }
});

test('manifest is private and inactive with only local push and PR creation permissions', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../.github/tuturuuu-bot/manifest.json')
    )
  );
  assert.equal(manifest.public, false);
  assert.equal(manifest.hook_attributes.active, false);
  assert.deepEqual(manifest.default_events, []);
  assert.deepEqual(manifest.default_permissions, {
    contents: 'write',
    pull_requests: 'write',
    metadata: 'read',
  });
});
