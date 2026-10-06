// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are tested as literal YAML values.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const root = resolve(__dirname, '../..');
const workflow = YAML.parse(
  readFileSync(resolve(root, '.github/workflows/meet-cloudflare.yaml'), 'utf8')
);

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
