const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowDecision,
  createFixtureRoot,
} = require('./workflow-config-test-helpers.js');

const REPO_ROOT = path.resolve(__dirname, '../..');

function readWorkflow(workflowName) {
  return fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', workflowName),
    'utf8'
  );
}

function assertJobPaused(workflow, jobName) {
  assert.match(
    workflow,
    new RegExp(
      `^  ${jobName}:\\n(?:    #.*\\n)*    if: \\$\\{\\{ false \\}\\}`,
      'mu'
    )
  );
}

test('paused TanStack and Rust workflows remain disabled', () => {
  const rootDir = createFixtureRoot();

  for (const [workflowName, changedFiles] of [
    ['rust-backend.yml', ['apps/backend/src/main.rs']],
    [
      'tanstack-route-manifest.yaml',
      ['apps/tanstack-web/migration/route-manifest.json'],
    ],
    [
      'vercel-production-tanstack-web.yaml',
      ['apps/tanstack-web/src/routes/index.tsx'],
    ],
  ]) {
    const decision = assertWorkflowDecision(
      { changedFiles, rootDir, workflowName },
      false
    );

    assert.match(decision.output, /disabled in tuturuuu\.ts/);
  }
});

test('direct TanStack deploy entrypoints remain paused', () => {
  assertJobPaused(
    readWorkflow('vercel-preview-tanstack-web.yaml'),
    'Build-Preview'
  );
  assertJobPaused(
    readWorkflow('vercel-production-tanstack-web.yaml'),
    'Build-Production'
  );
});

test('shared TypeScript checks exclude the paused TanStack package', () => {
  for (const workflowName of [
    'type-check.yaml',
    'turbo-unit-tests.yaml',
    'codecov.yaml',
  ]) {
    assert.match(
      readWorkflow(workflowName),
      /--filter='!@tuturuuu\/tanstack-web'/u,
      `${workflowName} must exclude @tuturuuu/tanstack-web`
    );
  }
});

test('root test and type-check commands exclude the paused TanStack package', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
  );

  for (const scriptName of ['test', 'type-check']) {
    assert.match(
      packageJson.scripts[scriptName],
      /--filter='!@tuturuuu\/tanstack-web'/u
    );
  }
});

test('Biome CI excludes both paused migration source trees', () => {
  const workflow = readWorkflow('biome-check.yaml');
  const exclusion =
    "git ls-files -z -- ':!apps/backend/**' ':!apps/tanstack-web/**'";

  assert.equal(
    workflow.split(exclusion).length - 1,
    3,
    'format check, lint check, and format repair must share the exclusions'
  );
});

test('Docker CI keeps migration-only execution skipped', () => {
  const workflow = readWorkflow('docker-setup-check.yaml');

  for (const stepName of [
    'Render paused TanStack dual-stack config',
    'Build TanStack web prod image',
    'Free Docker disk after TanStack web prod image',
    'Build backend image',
  ]) {
    assert.match(
      workflow,
      new RegExp(
        `- name: ${stepName}\\n        if: \\$\\{\\{ false \\}\\}`,
        'u'
      )
    );
  }

  assert.match(
    workflow,
    /--test-skip-pattern='\[Tt\]an\[Ss\]tack\|\[Rr\]ust\|\[Bb\]ackend\|\[Mm\]igration'/u
  );
  assert.doesNotMatch(
    workflow,
    /run: .*scripts\/run-tanstack-e2e-docker\.test\.js/u
  );
});

test('maintained E2E runs omit Rust while migration E2E remains skipped', () => {
  const workflow = readWorkflow('e2e-tests.yaml');

  assert.match(workflow, /^ {2}DOCKER_BACKEND_ENABLED: "0"$/mu);
  assert.match(workflow, /publish --frontend next/u);
  assert.match(
    workflow,
    / {2}migration-e2e:[\s\S]*?^ {4}if: \$\{\{ false \}\}$/mu
  );
  assert.doesNotMatch(
    workflow.slice(0, workflow.indexOf('  migration-e2e:')),
    /DOCKER_WEB_CACHE_BACKEND_FROM/u
  );
});
