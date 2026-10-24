// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub workflow expressions are literal inputs.
// Native Workers on cf: build once, qualify the emitted Build Output, and let the
// gated production job publish that exact artifact with retained Wrangler migrations.
const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const WORKERS = [
  { app: 'devbox-control', runtimeEnv: 'DEVBOX_TEST_BUILD_OUTPUT' },
  { app: 'coordination', runtimeEnv: 'COORDINATION_TEST_BUILD_OUTPUT' },
];

for (const { app, runtimeEnv } of WORKERS) {
  test(`${app} qualifies its cf Build Output and deploys the same artifact`, () => {
    const workflow = readWorkflow(`${app}-cloudflare.yaml`);
    const parityRun = `node scripts/ci/cf-worker-parity.mjs apps/${app} scripts/ci/fixtures/cf-worker-parity/${app}.json`;
    const steps = workflow.jobs.validate.steps;
    const build = steps.findIndex((step) =>
      step.with?.command?.startsWith(
        `bun turbo:local run build --filter=@tuturuuu/${app} `
      )
    );
    const parity = steps.findIndex((step) => step.run === parityRun);
    const emitted = steps.findIndex((step) => step.env?.[runtimeEnv] === '1');
    const dryRun = steps.findIndex((step) =>
      step.run?.startsWith('bun x --no-install cf deploy --prebuilt')
    );
    const upload = steps.findIndex((step) =>
      step.uses?.startsWith('actions/upload-artifact@')
    );
    assert.ok(build >= 0, 'build the Worker once');
    for (const [name, index] of Object.entries({ parity, emitted, dryRun }))
      assert.ok(
        index > build && upload > index,
        `${name} runs between build and upload`
      );
    assert.match(steps[dryRun].run, /--dry-run --no-provision$/);
    assert.equal(steps[upload].with.name, `${app}-worker-\${{ github.sha }}`);

    assert.equal(
      workflow.jobs.deploy.if,
      "github.ref == 'refs/heads/production'"
    );
    const deployment = workflow.jobs.deploy.steps;
    const download = deployment.findIndex((step) =>
      step.uses?.startsWith('actions/download-artifact@')
    );
    const recheck = deployment.findIndex(
      (step) => step.run === `${parityRun} "$CLOUDFLARE_ACCOUNT_ID"`
    );
    const publishing = deployment.filter((step) =>
      step.run?.includes('wrangler deploy --no-bundle')
    );
    assert.equal(publishing.length, 1, 'publish exactly once');
    const publishIndex = deployment.indexOf(publishing[0]);
    assert.ok(download >= 0 && recheck > download && publishIndex > recheck);
    assert.equal(deployment[download].with.name, steps[upload].with.name);
    assert.equal(
      deployment[download].with.path,
      `apps/${app}/.cloudflare/output`
    );
    assert.match(
      publishing[0].run.trim().split('\n').at(-1),
      /wrangler deploy --no-bundle -c \.cloudflare\/wrangler-publication\.json --message "\$GITHUB_SHA"/
    );
    assert.ok(
      !deployment.some((step) =>
        /cf deploy|workers versions create/.test(step.run ?? '')
      ),
      'cf DO publication remains disabled until a separate rehearsal-backed change'
    );
    const prepare = deployment.findIndex((step) =>
      step.run?.includes('cf-wrangler-publication.mjs')
    );
    assert.ok(prepare > recheck && prepare < publishIndex);
    assert.match(deployment[prepare].run, /"\$CLOUDFLARE_ACCOUNT_ID"$/);
    const realPublication = steps.findIndex(
      (step) =>
        step.run ===
        'node --test scripts/ci/cf-wrangler-publication.runtime.mjs'
    );
    assert.ok(realPublication > build && realPublication < upload);
    assert.equal(steps[realPublication].env.CF_PUBLICATION_TEST_APP, app);
    assert.equal(steps[realPublication]['continue-on-error'], undefined);
    for (const event of ['pull_request', 'push']) {
      assert.ok(
        workflow.on[event].paths.includes(
          'scripts/ci/cf-wrangler-publication.runtime.mjs'
        )
      );
    }
    const retainedCheck = steps.findIndex((step) =>
      step.run?.includes('wrangler deploy --dry-run --no-bundle')
    );
    assert.ok(retainedCheck > build && retainedCheck < upload);
    if (app === 'coordination') {
      const secretCheck = deployment.findIndex(
        (step) =>
          step.name === 'Verify the coordination token survived publication'
      );
      assert.ok(secretCheck > publishIndex);
      assert.match(deployment[secretCheck].run, /secret list/);
      assert.match(deployment[secretCheck].run, /COORDINATION_TOKEN/);
      assert.equal(deployment[secretCheck]['continue-on-error'], undefined);
    }
    assert.equal(publishing[0]['working-directory'], `apps/${app}`);
    assert.ok(
      !deployment.some((step) =>
        /\bturbo:local run build\b|\bbun run build\b/u.test(
          `${step.run ?? ''} ${step.with?.command ?? ''}`
        )
      ),
      'do not replace the tested artifact with a second build'
    );
  });
}
