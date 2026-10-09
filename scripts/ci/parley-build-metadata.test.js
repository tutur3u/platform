// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are literal workflow inputs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('Parley generates exact source identity before dependency and Worker builds', () => {
  const steps = readWorkflow('parley-cloudflare.yaml').jobs.validate.steps;
  const metadata = steps.findIndex((step) =>
    step.run?.includes('generate-build-metadata.ts')
  );
  assert.ok(metadata >= 0);
  for (const command of ['turbo run build', 'build:cloudflare']) {
    assert.ok(
      steps.findIndex((step) =>
        (step.run ?? step.with?.command ?? '').includes(command)
      ) > metadata
    );
  }
  assert.equal(
    steps[metadata].env.PLATFORM_BUILD_COMMIT_HASH,
    '${{ github.sha }}'
  );
  assert.equal(
    steps[metadata].env.PLATFORM_BUILD_REF_NAME,
    '${{ github.ref_name }}'
  );
  const built = steps.findIndex((step) =>
    step.with?.command?.includes('build:cloudflare')
  );
  assert.ok(
    steps.findIndex((step) => step.run === 'node --test verify.mjs') > built
  );
});
