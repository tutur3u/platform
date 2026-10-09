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
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.notEqual(start, -1, `Missing job ${jobName}`);
  const rest = workflow.slice(start + jobName.length + 4);
  const next = rest.search(/^ {2}[\w-]+:\n/m);
  const block = next < 0 ? rest : rest.slice(0, next);
  assert.ok(
    /^ {4}if: \$\{\{ false \}\}/m.test(block),
    `${jobName} must be unconditionally paused`
  );
}

test('paused Docker, TanStack and Rust workflows remain disabled', () => {
  const rootDir = createFixtureRoot();

  for (const [workflowName, changedFiles] of [
    ['docker-setup-check.yaml', ['apps/web/Dockerfile']],
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
      workflowName === 'type-check.yaml'
        ? readWorkflow(workflowName)
        : fs.readFileSync(
            path.join(REPO_ROOT, 'scripts/ci/test-shards.js'),
            'utf8'
          ),
      /--filter='?!@tuturuuu\/tanstack-web'?/u,
      `${workflowName} must exclude @tuturuuu/tanstack-web`
    );
  }
});

test('root test and type-check commands exclude the paused TanStack package', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
  );

  for (const scriptName of ['test', 'tc', 'type-check']) {
    assert.match(
      packageJson.scripts[scriptName],
      /--filter='!@tuturuuu\/tanstack-web'/u
    );
  }
});

test('Biome CI excludes both paused migration source trees', () => {
  const biomeConfig = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'biome.json'), 'utf8')
  );

  assert.ok(biomeConfig.files.includes.includes('!apps/backend'));
  assert.ok(biomeConfig.files.includes.includes('!apps/tanstack-web'));
});

test('Docker setup CI is paused even for manual dispatch', () => {
  const workflow = readWorkflow('docker-setup-check.yaml');
  assertJobPaused(workflow, 'verify');
  assertJobPaused(workflow, 'release-relevance');

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

test('Docker-backed E2E and migration E2E stay paused', () => {
  const workflow = readWorkflow('e2e-tests.yaml');
  for (const job of [
    'relevance',
    'prepare-e2e-images',
    'e2e',
    'inventory-storefront-cache-e2e',
    'migration-e2e',
    'cleanup-e2e-images',
  ]) {
    assertJobPaused(workflow, job);
  }

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

test('manual Rust verification and nested Rust parity cannot bypass the pause', () => {
  for (const job of ['verify', 'worker-bundle'])
    assertJobPaused(readWorkflow('rust-verify.yml'), job);
  assertJobPaused(
    readWorkflow('creator-identity-contract.yaml'),
    'rust-profile-parity'
  );
});
