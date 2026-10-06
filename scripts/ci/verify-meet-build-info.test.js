const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BUILD_INFO_URL,
  main,
  requestBuildInfo,
  verifyMeetBuildInfo,
} = require('./verify-meet-build-info');
const sha = 'a'.repeat(40);
const metadata = {
  appName: 'meet',
  commitHash: sha,
  environment: 'production',
  refName: 'production',
};
const verify = (value) =>
  verifyMeetBuildInfo({ sha, status: 200, body: JSON.stringify(value) });

test('accepts only the exact canonical Meet production candidate', () => {
  assert.doesNotThrow(() => verify(metadata));
  for (const change of [
    { commitHash: 'local' },
    { commitHash: 'b'.repeat(40) },
    { appName: 'web' },
    { environment: 'preview' },
    { refName: 'main' },
  ])
    assert.throws(() => verify({ ...metadata, ...change }), /does not match/);
});
test('fails closed for missing, malformed or non-JSON metadata without echoing bodies', () => {
  for (const value of [null, {}, [], 'private response'])
    assert.throws(() => verify(value), /does not match/);
  assert.throws(
    () => verifyMeetBuildInfo({ sha, status: 200, body: 'private response' }),
    /^Error: Meet build identity probe expected JSON$/
  );
  for (const status of [301, 404, 503])
    assert.throws(
      () => verifyMeetBuildInfo({ sha, status, body: '{}' }),
      /HTTP probe failed/
    );
});
test('rejects invalid candidate SHA before requesting the canonical endpoint', () => {
  let requests = 0;
  assert.throws(
    () =>
      main({
        env: { GITHUB_SHA: 'local' },
        request: () => {
          requests++;
        },
      }),
    /full source SHA/
  );
  assert.equal(requests, 0);
});
test('CLI admission passes its expected SHA to response verification', () => {
  assert.throws(
    () =>
      main({
        env: { GITHUB_SHA: sha },
        request: () => ({
          status: 200,
          body: JSON.stringify({ ...metadata, commitHash: 'b'.repeat(40) }),
        }),
      }),
    /does not match/
  );
});

test('canonical probe is bounded, credential-free and preserves HTTP status', () => {
  const result = requestBuildInfo((command, args, options) => {
    assert.equal(command, 'curl');
    assert.equal(args.at(-1), BUILD_INFO_URL);
    assert.ok(!args.includes('--location'));
    assert.ok(!args.includes('--header'));
    assert.ok(args.includes('--max-time'));
    assert.equal(options.maxBuffer, 64 * 1024);
    assert.equal(options.timeout, 25000);
    return '{}\nTTR_HTTP_STATUS:503';
  });
  assert.deepEqual(result, { status: 503, body: '{}' });
  assert.throws(
    () =>
      requestBuildInfo(() => {
        throw new Error('private transport response');
      }),
    /^Error: Meet canonical build identity probe could not complete$/
  );
  assert.throws(
    () => requestBuildInfo(() => 'private malformed response'),
    /^Error: Meet canonical build identity probe could not complete$/
  );
});
