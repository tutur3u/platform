const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, mkdir, writeFile, rm, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const {
  responseHeaders,
  safeEnvironment,
  verifyCss,
} = require('./verify-staged-style');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('preserves staged CSP and MIME without forwarding deployment cookies or compressed lengths', () => {
  const headers = responseHeaders(
    'HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\nContent-Type: text/css\r\nContent-Security-Policy: default-src self\r\nSet-Cookie: sensitive=stub\r\nContent-Encoding: gzip\r\nContent-Length: 10\r\n\r\n'
  );
  assert.deepEqual(headers, {
    'content-type': 'text/css',
    'content-security-policy': 'default-src self',
  });
  assert.throws(() => responseHeaders('not a response'), /headers/);
});

test('browser children receive no deployment, GitHub or arbitrary secret environment', () => {
  assert.deepEqual(
    safeEnvironment({
      PATH: '/bin',
      HOME: '/fixture',
      VERCEL_TOKEN: 'stub',
      GITHUB_TOKEN: 'stub',
      GH_TOKEN: 'stub',
      CUSTOM_SECRET: 'stub',
    }),
    { PATH: '/bin', HOME: '/fixture' }
  );
});

test('CSS must match the exact built asset and cannot escape its artifact root', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'staged-css-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactRoot = resolve(root, 'static');
  const file = resolve(artifactRoot, '_next/static/chunks/site.css');
  const body = Buffer.from('.flex{display:flex}.p-4{padding:1rem}');
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, body);
  const input = {
    artifactRoot,
    pathname: '/_next/static/chunks/site.css',
    body,
    contentType: 'text/css; charset=utf-8',
  };
  const proof = await verifyCss(input);
  assert.equal(proof.expectedBytes, body.length);
  assert.equal(proof.bytes, body.length);
  assert.match(proof.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    verifyCss({ ...input, body: Buffer.from('.flex{}') }),
    /bytes differ/
  );
  await assert.rejects(
    verifyCss({ ...input, contentType: 'text/html' }),
    /content type/
  );
  await assert.rejects(
    verifyCss({ ...input, pathname: '/api/private.css' }),
    /outside/
  );
  await assert.rejects(
    verifyCss({ ...input, pathname: '/_next/static/../../../secret.css' })
  );
  const outside = resolve(root, 'outside.css');
  await writeFile(outside, body);
  await symlink(outside, resolve(artifactRoot, '_next/static/escape.css'));
  await assert.rejects(
    verifyCss({ ...input, pathname: '/_next/static/escape.css' }),
    /escapes/
  );
  await writeFile(file, '');
  await assert.rejects(
    verifyCss({ ...input, body: Buffer.alloc(0) }),
    /bytes differ/
  );
});

test('platform promotion requires staged CSS and uploaded 390/1440 proof first', () => {
  const workflow = readWorkflow('vercel-production-platform.yaml');
  const steps = workflow.jobs['Deploy-Production'].steps;
  const stage = steps.findIndex((s) => s.id === 'stage_deployment');
  const auth = steps.findIndex(
    (s) => s.run === 'node scripts/ci/verify-staged-critical-app.js'
  );
  const style = steps.findIndex(
    (s) => s.run === 'node scripts/ci/verify-staged-style.js'
  );
  const upload = steps.findIndex((s) => s.name === 'Retain staged style proof');
  const promote = steps.findIndex((s) => s.id === 'promote');
  assert.ok(stage < auth && auth < style && style < upload && upload < promote);
  assert.equal(steps[style]['continue-on-error'], undefined);
  assert.equal(steps[upload]['continue-on-error'], undefined);
  assert.equal(
    steps[style].env.VERCEL_STAGED_DEPLOYMENT_URL,
    '${{ steps.stage_deployment.outputs.url }}'
  );
  assert.equal(steps[style].env.VERCEL_STAGED_APP, 'platform');
  assert.ok(steps[upload].with.path.includes('staged-style-proof'));
});
