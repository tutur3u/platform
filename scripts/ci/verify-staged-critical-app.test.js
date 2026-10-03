const test = require('node:test');
const assert = require('node:assert/strict');
const {
  READS,
  curlArguments,
  parseCurlOutput,
  verifyStagedApp,
} = require('./verify-staged-critical-app.js');
const sha = 'a'.repeat(40);
const stamp = (app) => ({
  status: 200,
  body: JSON.stringify({
    commitHash: sha,
    appName: app === 'platform' ? 'web' : app,
    environment: 'production',
  }),
});
const denied = { status: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
for (const app of Object.keys(READS)) {
  test(`${app} checks exact production identity and GET/HEAD authentication without writes`, async () => {
    const calls = [];
    await verifyStagedApp({
      app,
      sha,
      request: async (path, method) => {
        calls.push({ path, method });
        return path === '/api/build-info' ? stamp(app) : denied;
      },
    });
    assert.equal(calls.length, 1 + 2 * READS[app].length);
    assert.ok(calls.every((call) => ['GET', 'HEAD'].includes(call.method)));
  });
}
for (const status of [200, 302, 403, 404, 429, 500, 503]) {
  test(`blocks promotion on unexpected auth-boundary status ${status}`, async () => {
    await assert.rejects(
      verifyStagedApp({
        app: 'finance',
        sha,
        request: async (path) =>
          path === '/api/build-info'
            ? stamp('finance')
            : { status, body: '{}' },
      }),
      /auth-boundary probe failed/
    );
  });
}
test('blocks stale identity before probing APIs', async () => {
  let calls = 0;
  await assert.rejects(
    verifyStagedApp({
      app: 'tasks',
      sha,
      request: async () => {
        calls++;
        return {
          status: 200,
          body: JSON.stringify({
            commitHash: 'b'.repeat(40),
            appName: 'tasks',
            environment: 'production',
          }),
        };
      },
    }),
    /identity/
  );
  assert.equal(calls, 1);
});
test('does not mistake deployment protection HTML for application auth', async () => {
  await assert.rejects(
    verifyStagedApp({
      app: 'contacts',
      sha,
      request: async (path) =>
        path === '/api/build-info'
          ? stamp('contacts')
          : { status: 401, body: '<html>Login</html>' },
    }),
    /expected JSON/
  );
});
test('parses curl status separately from untrusted body and rejects missing statuses', () => {
  assert.deepEqual(
    parseCurlOutput('{"error":"Unauthorized"}\nTTR_HTTP_STATUS:401'),
    denied
  );
  assert.throws(() => parseCurlOutput('no status'), /HTTP status/);
  assert.throws(() => parseCurlOutput('\nTTR_HTTP_STATUS:000'), /Invalid/);
});

test('CLI forwards only curl flags and uses an intentionally invalid machine key', () => {
  const args = curlArguments(
    '/api/build-info',
    'GET',
    'https://candidate.vercel.app'
  );
  assert.deepEqual(args.slice(0, 5), [
    'curl',
    '/api/build-info',
    '--deployment',
    'https://candidate.vercel.app',
    '--',
  ]);
  assert.ok(args.includes('Authorization: Bearer ttr_invalid_rollout_canary'));
  assert.ok(!args.includes('--token'));
  assert.ok(!args.includes('--scope'));
  assert.ok(!args.includes('--yes'));
  assert.ok(!args.includes('--head'));
  assert.ok(
    curlArguments(
      '/api/example',
      'HEAD',
      'https://candidate.vercel.app'
    ).includes('--head')
  );
});
