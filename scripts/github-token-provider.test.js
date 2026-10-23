const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createGitHubChecksTokenProvider,
  normalizeRuntimeCredential,
} = require('./watch-blue-green/github-token-provider');

test('generated credentials require HTTPS from environment and runtime files', async () => {
  const tokenUrl = 'http://example.invalid/token';
  const provider = createGitHubChecksTokenProvider({
    env: {
      TUTURUUU_CI_GITHUB_TOKEN_URL: tokenUrl,
      TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN: 'synthetic-client',
    },
    paths: {},
    fetchImpl: () => assert.fail('insecure endpoint must not be called'),
  });
  assert.equal(await provider.getToken(), null);
  assert.equal(
    normalizeRuntimeCredential({
      kind: 'tuturuuu-github-bot-runtime-token',
      tokenUrl,
      clientToken: 'synthetic-client',
      expiresAt: '2099-01-01T00:00:00Z',
    }),
    null
  );
});

test('generated token requests reject redirects without caching a failed request', async () => {
  let calls = 0;
  const provider = createGitHubChecksTokenProvider({
    env: {
      TUTURUUU_CI_GITHUB_TOKEN_URL: 'https://example.invalid/token',
      TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN: 'synthetic-client',
    },
    paths: {},
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      throw new TypeError('redirect refused');
    },
  });
  await assert.rejects(provider.getToken(), /redirect refused/);
  await assert.rejects(provider.getToken(), /redirect refused/);
  assert.equal(calls, 2);
});
