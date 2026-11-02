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

test('native-only serving chain', () => {
  assert.deepEqual(needs('seal-worker'), ['admit']);
  assert.deepEqual(needs('restored'), ['seal-worker']);
  assert.deepEqual(needs('publish-worker'), ['restored']);
  assert.deepEqual(needs('verify-ingress'), ['publish-worker']);
  assert.doesNotMatch(
    text,
    /VERCEL_|wave1-web-next-staging|WEB_STAGING_NEXT_ADMISSION|next-deploy|next-verify/
  );
});

test('every secret-bearing job transitively needs preflight', () => {
  assert.deepEqual(needs('admit'), ['preflight']);
  const ancestors = (job) => needs(job).flatMap((n) => [n, ...ancestors(n)]);
  for (const [job, config] of Object.entries(workflow.jobs))
    if (JSON.stringify(config).includes('secrets.'))
      assert.ok(ancestors(job).includes('preflight'), job);
});

test('credentials live only in their protected environments', () => {
  const env = (job) => workflow.jobs[job].environment;
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

test('only publish-worker uploads and ingress performs readback', () => {
  const runs = (job) =>
    workflow.jobs[job].steps.map((s) => s.run ?? '').join('\n');
  assert.match(
    runs('publish-worker'),
    /wave1-native-publish\.mjs publish web staging/
  );
  for (const job of Object.keys(workflow.jobs).filter(
    (j) => j !== 'publish-worker'
  ))
    assert.doesNotMatch(runs(job), /wave1-native-publish\.mjs publish/);
  assert.match(runs('verify-ingress'), /readback\.mjs --app web/);
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

// Check explicit step environments; this does not isolate a shared runner.
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
});

// R-c: neither the workflow nor any publisher/readback source changes the
// Access phase or the serving intent; they are read-only GitHub reads.
test('the Access phase and serving intent are never written', () => {
  assert.doesNotMatch(text, /STAGING_ACCESS_PHASE\s*[:=]/u);
  const sources = [
    'wave1-native-publish.mjs',
    'wave1-ingress-preflight.mjs',
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

test('all Web staging jobs disable install scripts', () => {
  let installs = 0;
  for (const [name, job] of Object.entries(workflow.jobs))
    for (const step of job.steps ?? [])
      for (const command of `${step.run ?? ''}\n${step.with?.command ?? ''}`
        .replace(/\\\n/gu, ' ')
        .split(/[\n;&|]/u)) {
        if (!/\bbun\s+install\b/u.test(command)) continue;
        installs++;
        assert.match(command, /(?:^|\s)--ignore-scripts(?:\s|$)/u, name);
      }
  assert.ok(installs >= 3, 'all Web staging installs were scanned');
});
