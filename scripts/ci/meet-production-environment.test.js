const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

// Meet's release bot may only be granted review access on an environment that
// Parley does not share, so Meet's deploy job moves to a dedicated environment
// behind an explicit readiness variable while Parley keeps `meet-production`.
const READY = "vars.MEET_DEDICATED_PRODUCTION_ENV_READY == 'true'";
const DEDICATED_TOKEN = 'secrets.MEET_DEDICATED_CLOUDFLARE_API_TOKEN';
const SHARED_TOKENS = [
  'secrets.MEET_CLOUDFLARE_API_TOKEN',
  'secrets.COLAB_CLOUDFLARE_API_TOKEN',
];

const meetDeploy = readWorkflow('meet-cloudflare.yaml').jobs.deploy;
const parleyDeploy = readWorkflow('parley-cloudflare.yaml').jobs.deploy;
const compact = (value) => String(value).replace(/\s+/gu, ' ').trim();

test('Meet deploy selects its dedicated environment only when marked ready', () => {
  assert.equal(
    compact(meetDeploy.environment),
    `\${{ ${READY} && 'meet-cloudflare-production' || 'meet-production' }}`
  );
});

test('Parley keeps the shared environment the Meet bot is never granted', () => {
  assert.equal(parleyDeploy.environment, 'meet-production');
  assert.doesNotMatch(
    JSON.stringify(parleyDeploy),
    /MEET_DEDICATED_|meet-cloudflare-production/u
  );
});

test('the dedicated environment uses only its own Cloudflare credential', () => {
  const tokenSteps = meetDeploy.steps.filter(
    (step) => step.env?.CLOUDFLARE_API_TOKEN
  );
  assert.ok(tokenSteps.length >= 5, 'expected every Cloudflare step');
  assert.equal(meetDeploy.env?.CLOUDFLARE_API_TOKEN, undefined);

  for (const step of tokenSteps) {
    const expression = compact(step.env.CLOUDFLARE_API_TOKEN);
    const [dedicated, shared, fallback] = expression
      .replace(/^\$\{\{\s*|\s*\}\}$/gu, '')
      .split(' || (')
      .map((part) => part.trim());

    assert.equal(dedicated, `(${READY} && ${DEDICATED_TOKEN})`, step.name);
    assert.ok(
      shared.startsWith(`vars.MEET_DEDICATED_PRODUCTION_ENV_READY != 'true'`),
      step.name
    );
    for (const token of SHARED_TOKENS) {
      assert.ok(shared.includes(token), `${step.name} keeps ${token}`);
      assert.ok(!dedicated.includes(token), `${step.name} dedicated path`);
    }
    assert.equal(fallback, undefined, step.name);
    assert.ok(expression.endsWith("|| '' }}"), step.name);
  }
});
