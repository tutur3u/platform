// Shape of the staging Web publisher workflow (design §3, Tess §16 ordering).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const file = 'wave1-web-staging.yaml';
const workflow = readWorkflow(file, { raw: true });
const text = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows', file),
  'utf8'
);
const needs = (job) => [workflow.jobs[job].needs ?? []].flat();

test('dispatch-only from main, serialized, read-only by default', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.source_sha.required, true);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'wave1-web-staging',
    'cancel-in-progress': false,
  });
  assert.equal(workflow.jobs.admit.if, "github.ref == 'refs/heads/main'");
});

test('the serving-order gate: verify before seal, publish and readback', () => {
  assert.deepEqual(needs('next-deploy'), ['admit']);
  assert.deepEqual(needs('next-verify'), ['next-deploy']);
  assert.deepEqual(needs('seal-worker'), ['next-verify']);
  assert.deepEqual(needs('restored'), ['seal-worker']);
  assert.deepEqual(needs('publish-worker').sort(), ['next-verify', 'restored']);
  assert.deepEqual(needs('verify-ingress').sort(), [
    'next-verify',
    'publish-worker',
  ]);
});

test('credentials live only in their protected environments', () => {
  const env = (job) => workflow.jobs[job].environment;
  assert.equal(env('next-deploy'), 'wave1-web-next-staging');
  assert.equal(env('next-verify'), 'wave1-web-next-staging');
  assert.equal(env('publish-worker'), 'wave1-web-staging');
  assert.equal(env('verify-ingress'), 'wave1-web-staging');
  for (const job of ['admit', 'seal-worker', 'restored']) {
    assert.equal(env(job), undefined, job);
    assert.ok(
      !JSON.stringify(workflow.jobs[job]).includes('secrets.'),
      `${job} must be credential-free`
    );
  }
  assert.ok(!/secrets\.CLOUDFLARE_API_TOKEN\b|secrets: inherit/u.test(text));
});

test('only next-verify can record verified, and only publish-worker uploads', () => {
  const runs = (job) =>
    workflow.jobs[job].steps.map((s) => s.run ?? '').join('\n');
  assert.match(runs('next-verify'), /wave1-web-next\.mjs verify/);
  for (const job of Object.keys(workflow.jobs).filter(
    (j) => j !== 'next-verify'
  ))
    assert.doesNotMatch(runs(job), /wave1-web-next\.mjs verify/, job);
  assert.match(
    runs('publish-worker'),
    /wave1-native-publish\.mjs publish web staging/
  );
  for (const job of Object.keys(workflow.jobs).filter(
    (j) => j !== 'publish-worker'
  ))
    assert.doesNotMatch(runs(job), /wave1-native-publish\.mjs publish/, job);
  assert.match(runs('verify-ingress'), /readback\.mjs --app web/);
  assert.match(runs('verify-ingress'), /wave1-web-next\.mjs recheck/);
});

test('the workflow never performs serving, domain, Access or DNS changes', () => {
  for (const forbidden of [
    /actions\/variables[^\n]*-X\s*(PATCH|POST|PUT)/iu,
    /gh variable set/iu,
    /workers\/domains[^\n]*(PUT|POST)/iu,
    /dns_records[^\n]*(PUT|POST|PATCH|DELETE)/iu,
    /access\/apps[^\n]*(PUT|POST|PATCH|DELETE)/iu,
    /vercel (alias|domains|promote|remove|rm)\b/iu,
    /--prod\b/u,
    // No package CLI runs directly: every Cloudflare write goes through the
    // reviewed publisher, and no Cloudflare CLI may touch domains or routes.
    /\b(?:bunx|npx|bun x)\b/u,
    /\bcf\s+(?:domains?|routes?|dns|access)\b/iu,
  ])
    assert.doesNotMatch(text, forbidden);
  assert.match(text, /never attaches domains/u);
});

// M1: repo build code never sees deploy, provider or control credentials.
const forbiddenCredential =
  /^(VERCEL_TOKEN|CLOUDFLARE_|WAVE1_CONTROL_READ_TOKEN)/u;
const buildCode =
  /vercel build|build:candidate|test:candidate|bun install|turbo|generate-build-metadata|wave1-native-archive|wave1-web-seal/u;
test('no build step sees VERCEL_TOKEN*, CLOUDFLARE_* or WAVE1_CONTROL_READ_TOKEN', () => {
  let builds = 0;
  for (const [name, job] of Object.entries(workflow.jobs))
    for (const step of job.steps ?? []) {
      const command = `${step.run ?? ''} ${step.with?.command ?? ''}`;
      if (!buildCode.test(command)) continue;
      builds++;
      const env = {
        ...(workflow.env ?? {}),
        ...(job.env ?? {}),
        ...(step.env ?? {}),
      };
      for (const [key, value] of Object.entries(env)) {
        assert.doesNotMatch(
          key,
          forbiddenCredential,
          `${name}: ${step.name ?? command}`
        );
        assert.doesNotMatch(
          String(value),
          /secrets\.(VERCEL_TOKEN|CLOUDFLARE_|WAVE1_CONTROL_READ_TOKEN)/u,
          `${name}: ${key}`
        );
      }
      assert.doesNotMatch(
        command,
        /--token/u,
        `${name}: build commands take no token`
      );
    }
  assert.ok(builds >= 6, 'build steps were found');
  const deploy = workflow.jobs['next-deploy'].steps;
  const build = deploy.find((s) => /vercel build/u.test(s.with?.command ?? ''));
  assert.ok(build && !build.env?.VERCEL_TOKEN && !build.env?.VERCEL_ORG_ID);
  assert.ok(
    deploy.find((s) => /vercel pull/u.test(s.run ?? '')).env.VERCEL_TOKEN
  );
});

// R-c: neither the workflow nor any publisher/readback source changes the
// Access phase or the serving intent; they are read-only GitHub reads.
test('the Access phase and serving intent are never written', () => {
  assert.doesNotMatch(text, /STAGING_ACCESS_PHASE\s*[:=]/u);
  const sources = [
    'wave1-native-publish.mjs',
    'wave1-ingress-preflight.mjs',
    'wave1-web-next.mjs',
    'wave1-web-rollback.mjs',
    '../wave1-staging/readback.mjs',
  ].map((name) => fs.readFileSync(path.join(__dirname, name), 'utf8'));
  for (const source of sources) {
    assert.doesNotMatch(source, /method:\s*'(PATCH|PUT|DELETE)'/u);
    assert.doesNotMatch(
      source,
      /actions\/variables[^\n]*,\s*\w+,\s*\{/u,
      'no body on a variables request'
    );
  }
});

// R-d: the only automatic recovery is a Worker-scoped rollback on failure.
test('a red verify-ingress rolls back only the staging Worker', () => {
  const steps = workflow.jobs['verify-ingress'].steps;
  const rollback = steps.at(-1);
  assert.equal(rollback.if, 'failure()');
  assert.match(
    rollback.run,
    /^node scripts\/ci\/wave1-web-rollback\.mjs "\$SOURCE_SHA"$/u
  );
  assert.deepEqual(Object.keys(rollback.env).sort(), [
    'CLOUDFLARE_STAGING_ACCOUNT_ID',
    'CLOUDFLARE_STAGING_API_TOKEN',
    'WAVE1_STAGING_ATTEMPT_D1_ID',
  ]);
  for (const [name, job] of Object.entries(workflow.jobs))
    if (name !== 'verify-ingress')
      assert.ok(!JSON.stringify(job).includes('wave1-web-rollback'), name);
});

test('staging installs disable lifecycle scripts and pull uses environment authentication', () => {
  const steps = workflow.jobs['next-deploy'].steps;
  for (const step of steps.filter((s) => /bun install/u.test(s.run ?? '')))
    assert.match(step.run, /--ignore-scripts/u);
  const pull = steps.find((s) => /vercel pull/u.test(s.run ?? ''));
  assert.ok(pull.env.VERCEL_TOKEN);
  assert.doesNotMatch(pull.run, /--token/u);
});
