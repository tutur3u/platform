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
    /wrangler[^\n]*(domain|route)/iu,
  ])
    assert.doesNotMatch(text, forbidden);
  assert.match(text, /never attaches domains/u);
});
