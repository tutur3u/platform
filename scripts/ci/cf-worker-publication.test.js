// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub workflow expressions are literal inputs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

for (const app of ['cron-control', 'devbox-control', 'coordination']) {
  test(`${app} snapshots deployment settings around every publication`, () => {
    const steps = readWorkflow(`${app}-cloudflare.yaml`).jobs.deploy.steps;
    const before = steps.findIndex((step) =>
      step.run?.includes('cf-worker-settings.mjs before')
    );
    const after = steps.findIndex((step) =>
      step.run?.includes('cf-worker-settings.mjs after')
    );
    const marker = steps.findIndex((step) =>
      step.run?.includes('record-deployment-marker.ts')
    );
    const mutations = steps
      .map((step, index) =>
        /(?:wrangler|cf) (?:deploy|secret bulk)/.test(step.run ?? '')
          ? index
          : -1
      )
      .filter((index) => index >= 0);
    assert.ok(mutations.length > 0);
    assert.ok(before >= 0 && before < Math.min(...mutations));
    assert.ok(after > Math.max(...mutations) && marker > after);
    for (const index of [before, after])
      assert.equal(steps[index]['continue-on-error'], undefined);
    const evidence = steps.find(
      (step) => step.name === 'Retain settings and rollback evidence'
    );
    assert.equal(evidence.if, 'always()');
    assert.match(evidence.with.path, /settings-\*\.json$/);
  });
}

test('service deploy jobs pin the configured Cloudflare account by variable', () => {
  for (const app of ['cron-control', 'devbox-control', 'coordination']) {
    assert.equal(
      readWorkflow(`${app}-cloudflare.yaml`).jobs.deploy.env
        .CLOUDFLARE_ACCOUNT_ID,
      '${{ vars.CLOUDFLARE_ACCOUNT_ID }}'
    );
  }
});
