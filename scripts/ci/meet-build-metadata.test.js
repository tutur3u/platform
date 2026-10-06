// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are tested as literal YAML values.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { cp, mkdtemp, mkdir, rm } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const root = resolve(__dirname, '../..');
const workflow = readWorkflow('meet-cloudflare.yaml');

test('Meet generates source metadata before dependency and Worker builds', () => {
  const steps = workflow.jobs.validate.steps;
  const index = steps.findIndex((step) =>
    step.run?.includes('scripts/ci/generate-build-metadata.ts')
  );
  assert.ok(index >= 0, 'shared metadata generation is missing');
  for (const command of [
    'packages/types build',
    'turbo run build',
    'build:cloudflare',
  ]) {
    const build = steps.findIndex((step) =>
      (step.run ?? step.with?.command ?? '').includes(command)
    );
    assert.ok(build > index, `${command} must follow metadata generation`);
  }
  const env = steps[index].env;
  assert.equal(
    env.PLATFORM_BUILD_ENVIRONMENT,
    "${{ github.ref == 'refs/heads/production' && 'production' || 'preview' }}"
  );
  assert.equal(env.PLATFORM_BUILD_REF_NAME, '${{ github.ref_name }}');
  assert.equal(env.PLATFORM_BUILD_COMMIT_HASH, '${{ github.sha }}');
});

test('only the production deploy verifies canonical identity before its success marker', () => {
  assert.equal(
    workflow.jobs.deploy.if,
    "github.ref == 'refs/heads/production'"
  );
  const steps = workflow.jobs.deploy.steps;
  const verify = steps.findIndex((step) =>
    step.run?.includes('scripts/ci/verify-meet-build-info.js')
  );
  const deploy = steps.findIndex(
    (step) => step.name === 'Deploy the verified frontend'
  );
  const marker = steps.findIndex((step) =>
    step.run?.includes('record-deployment-marker.ts')
  );
  assert.ok(
    verify > deploy && marker > verify,
    'canonical identity must gate the success marker'
  );
  assert.notEqual(steps[verify]['continue-on-error'], true);
  assert.ok(
    !workflow.jobs.validate.steps.some((step) =>
      step.run?.includes('verify-meet-build-info.js')
    )
  );
});

test('metadata source and environment identity participate in dependency cache inputs', () => {
  const turbo = JSON.parse(readFileSync(resolve(root, 'turbo.json'), 'utf8'));
  assert.ok(turbo.tasks.build.inputs.includes('$TURBO_DEFAULT$'));
  for (const key of [
    'PLATFORM_BUILD_ENVIRONMENT',
    'PLATFORM_BUILD_REF_NAME',
    'PLATFORM_BUILD_COMMIT_HASH',
  ]) {
    assert.ok(turbo.tasks.build.env.includes(key));
  }
  const fallback = readFileSync(
    resolve(root, 'packages/utils/src/generated/platform-build-metadata.ts'),
    'utf8'
  );
  assert.match(fallback, /PLATFORM_BUILD_METADATA/);
  assert.equal(
    workflow.jobs.validate.steps.find((step) =>
      step.with?.name?.startsWith('meet-worker-')
    ).with.name,
    'meet-worker-${{ github.sha }}'
  );
});

test('Meet workflow contracts run in a clean snapshot without Node dependencies', async () => {
  const snapshot = await mkdtemp(join(tmpdir(), 'meet-workflow-clean-'));
  try {
    for (const file of [
      'scripts/ci/meet-build-metadata.test.js',
      'scripts/ci/workflow-yaml-test-helper.js',
      '.github/workflows/meet-cloudflare.yaml',
      'turbo.json',
      'packages/utils/src/generated/platform-build-metadata.ts',
    ]) {
      const destination = join(snapshot, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(resolve(root, file), destination);
    }
    const env = { ...process.env, NODE_PATH: '' };
    // A nested Node test worker otherwise suppresses its standalone reporter.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=tap',
        '--test-name-pattern=Meet generates|only the production|metadata source',
        join(snapshot, 'scripts/ci/meet-build-metadata.test.js'),
      ],
      {
        cwd: snapshot,
        env,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 128 * 1024,
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /pass 3/);
    assert.match(result.stdout, /fail 0/);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
});
