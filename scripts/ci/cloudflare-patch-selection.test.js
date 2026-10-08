const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function getWorkflowDecision(input) {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `import { getWorkflowDecision } from './tuturuuu.ts'; console.log(JSON.stringify(getWorkflowDecision(${JSON.stringify(input)})));`,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return JSON.parse(output);
}

const patch = 'patches/@opennextjs%2Fcloudflare@1.20.6.patch';
const consumers = ['meet', 'lettin', 'parley'];
const workers = ['cron-control', 'coordination', 'devbox-control'];
// Every package-backed target has a real manifest shape. Missing manifests
// would fail open and falsely make the patch-recognition positive tests pass.
const workspaceManifests = [
  ...consumers.map((app) => ({
    name: `@tuturuuu/${app}`,
    path: `apps/${app}`,
    dependencies: [],
  })),
  { name: '@tuturuuu/web', path: 'apps/web', dependencies: [] },
];

function decide(workflowName, changedFiles = [patch], options = {}) {
  return getWorkflowDecision({
    workflowName,
    changedFiles,
    eventName: 'push',
    ciConfig: { [workflowName]: true },
    workspaceManifests,
    ...options,
  });
}

for (const app of consumers) {
  test(`the exact OpenNext patch selects ${app}`, () => {
    const decision = decide(`${app}-cloudflare.yaml`);
    assert.equal(decision.shouldRun, true);
    assert.deepEqual(decision.matchedPaths, [patch]);
    assert.match(decision.reason, /affected by 1 changed path/);
  });

  test(`unrelated docs and unknown patches do not select ${app}`, () => {
    for (const path of [
      'apps/docs/build/devops/notes.mdx',
      'patches/unrelated-package.patch',
      'patches/@opennextjs%2Fcloudflare@2.0.0.patch',
    ]) {
      const decision = decide(`${app}-cloudflare.yaml`, [path]);
      assert.equal(decision.shouldRun, false);
      assert.deepEqual(decision.matchedPaths, []);
    }
  });
}

for (const app of workers) {
  test(`the OpenNext patch does not select the ${app} Worker`, () => {
    const decision = decide(`${app}-cloudflare.yaml`);
    assert.equal(decision.shouldRun, false);
    assert.deepEqual(decision.matchedPaths, []);
  });
}

for (const workflow of [
  'vercel-production-platform.yaml',
  'vercel-production-meet.yaml',
]) {
  test(`the OpenNext patch does not select ${workflow}`, () => {
    assert.equal(decide(workflow).shouldRun, false);
  });
}

test('disabled workflows remain disabled even for the patch or dispatch', () => {
  for (const eventName of ['push', 'workflow_dispatch']) {
    assert.equal(
      decide('meet-cloudflare.yaml', [patch], {
        eventName,
        ciConfig: { 'meet-cloudflare.yaml': false },
      }).shouldRun,
      false
    );
  }
});

test('ordinary dispatch still selects an enabled unrelated target', () => {
  assert.equal(
    decide('coordination-cloudflare.yaml', ['apps/docs/notes.mdx'], {
      eventName: 'workflow_dispatch',
    }).shouldRun,
    true
  );
});

test('unavailable and empty change lists retain fail-open behavior', () => {
  for (const changedFiles of [null, []]) {
    const decision = decide('meet-cloudflare.yaml', changedFiles);
    assert.equal(decision.shouldRun, true);
    assert.deepEqual(decision.matchedPaths, []);
    assert.match(decision.reason, /changed-file state is unavailable/);
  }
});

test('missing target manifests retain the separate fail-open branch', () => {
  const decision = decide('lettin-cloudflare.yaml', ['apps/docs/notes.mdx'], {
    workspaceManifests: [],
  });
  assert.equal(decision.shouldRun, true);
  assert.deepEqual(decision.matchedPaths, []);
  assert.match(decision.reason, /workspace manifest .* is unavailable/);
});

test('the exact patch is recognized after existing path normalization', () => {
  for (const path of [`./${patch}`, patch.replaceAll('/', '\\')]) {
    assert.deepEqual(decide('meet-cloudflare.yaml', [path]).matchedPaths, [
      patch,
    ]);
  }
});

test('own workflow and existing additional paths still select their owner', () => {
  for (const path of [
    '.github/workflows/meet-cloudflare.yaml',
    'apps/meet-realtime/src/worker.ts',
    'apps/web/src/app/api/v1/workspaces/ws-id/meetings/route.ts',
  ]) {
    assert.equal(decide('meet-cloudflare.yaml', [path]).shouldRun, true);
  }
});

test('platform deployment covers existing non-schema database migration controls', () => {
  for (const control of [
    'tuturuuu.ts',
    'tuturuuu.ci.ts',
    'scripts/ci/github-deployment-markers.ts',
  ]) {
    const decision = decide('vercel-production-platform.yaml', [control]);
    assert.equal(decision.shouldRun, true);
    assert.deepEqual(decision.matchedPaths, [control]);
    assert.equal(
      decision.reason,
      'platform deployment is required to gate production database migrations'
    );
  }
});

for (const workflow of [
  'vercel-production-platform.yaml',
  'supabase-production.yaml',
  'supabase-staging.yaml',
]) {
  test(`the exact four-path publication selects ${workflow}`, () => {
    const decision = decide(workflow, [
      patch,
      'scripts/ci/cloudflare-preview-props-manifest.test.mjs',
      'tuturuuu.ts',
      'scripts/ci/cloudflare-patch-selection.test.js',
    ]);
    assert.equal(decision.shouldRun, true);
    assert.deepEqual(decision.matchedPaths, ['tuturuuu.ts']);
    assert.equal(
      decision.reason,
      workflow === 'vercel-production-platform.yaml'
        ? 'platform deployment is required to gate production database migrations'
        : `${workflow} is affected by 1 database path(s)`
    );
  });
}
