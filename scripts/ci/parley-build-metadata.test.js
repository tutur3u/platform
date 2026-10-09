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

test('Parley push and PR triggers include the patch installed by its manifest', () => {
  const candidateSpec = require('../../apps/parley/package.json')
    .devDependencies['@opennextjs/cloudflare'];
  const patch =
    require('../../package.json').patchedDependencies[
      `@opennextjs/cloudflare@${candidateSpec}`
    ];
  assert.equal(typeof patch, 'string');
  assert.ok(
    require('node:fs').existsSync(
      require('node:path').resolve(__dirname, '../..', patch)
    )
  );
  const workflow = readWorkflow('parley-cloudflare.yaml');
  for (const event of ['push', 'pull_request']) {
    assert.ok(
      workflow.on[event].paths.includes(patch),
      `${event} must select the installed candidate patch`
    );
  }
});
