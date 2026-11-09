const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const {
  FAILURE_REASONS,
  describeFailure,
  main,
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

test('failure descriptions use only listed reasons, never raw error text', () => {
  assert.equal(
    describeFailure(
      new Error('Staged CSS bytes differ from the built artifact')
    ),
    'Staged CSS bytes differ from the built artifact'
  );
  assert.equal(
    describeFailure(
      new Error('page.evaluate: Error: Unverified stylesheet\n    at stack')
    ),
    'Unverified stylesheet'
  );
  const leaked = describeFailure(
    Object.assign(
      new Error('Command failed: vercel curl --token SECRET-VALUE'),
      {
        code: 1,
      }
    )
  );
  assert.equal(leaked, 'Unclassified Error:exit-1');
  assert.equal(
    describeFailure(
      Object.assign(new Error('SECRET-VALUE'), { code: 'ETIMEDOUT' })
    ),
    'Unclassified Error:ETIMEDOUT'
  );
  assert.equal(describeFailure(undefined), 'Unclassified Error');
});

test('every reason the script raises is listed for reporting', async () => {
  const source = await readFile(
    resolve(__dirname, 'verify-staged-style.js'),
    'utf8'
  );
  const raised = [
    ...source.matchAll(/new Error\(\s*'([^']+)'/gu),
    ...source.matchAll(/^\s*'((?:Candidate|Staged|An exact)[^']+)'\s*$/gmu),
  ].map((match) => match[1]);
  assert.ok(raised.length >= FAILURE_REASONS.length - 1);
  for (const reason of raised)
    assert.ok(FAILURE_REASONS.includes(reason), reason);
});

test('a failed proof logs its reason and still leaves evidence to upload', async (t) => {
  const temp = await mkdtemp(resolve(tmpdir(), 'staged-failure-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const sha = 'a'.repeat(40);
  const runCommand = async () => {
    throw Object.assign(new Error('Command failed: vercel curl SECRET-VALUE'), {
      code: 1,
    });
  };
  const env = {
    VERCEL_STAGED_DEPLOYMENT_URL: 'https://platform-fixture.vercel.app',
    VERCEL_STAGED_APP: 'platform',
    VERCEL_TOKEN: 'SECRET-VALUE',
    GITHUB_SHA: sha,
    RUNNER_TEMP: temp,
  };
  await assert.rejects(main({ env, runCommand }), (error) => {
    assert.equal(error.stagedReason, 'Unclassified Error:exit-1');
    return true;
  });
  const text = await readFile(
    resolve(temp, 'staged-style-proof', sha, 'failure.json'),
    'utf8'
  );
  assert.deepEqual(JSON.parse(text), {
    source: sha,
    deployment: 'https://platform-fixture.vercel.app',
    stage: 'identity',
    reason: 'Unclassified Error:exit-1',
    resourceFailures: [],
  });
  assert.ok(!text.includes('SECRET-VALUE'));
});
