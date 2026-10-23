const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  parseArgs,
  loadPrivateKey,
  createAppJwt,
  runCli,
} = require('../tuturuuu-bot-token');

const argv = [
  '--permissions',
  'contents=write,pull_requests=write',
  '--',
  'gh',
  'pr',
  'create',
];
const token = 'ghs_fake_test_token';
function fixture(overrides = {}) {
  const calls = [];
  let output = '';
  return {
    calls,
    output: () => output,
    deps: {
      env: { TUTURUUU_BOT_APP_ID: '123', TUTURUUU_BOT_INSTALLATION_ID: '456' },
      read: (file, args, options) => {
        calls.push({ file, args, options });
        return 'mock-private-key';
      },
      sign: (_algorithm, _input, key) => {
        assert.equal(key, 'mock-private-key');
        return Buffer.from('signature');
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ token }) };
      },
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
      stderr: {
        write: (text) => {
          output += text;
        },
      },
      ...overrides,
    },
  };
}

test('keychain + mocked signer mint platform-only scoped token, child env only, then revoke', async () => {
  const f = fixture();
  assert.equal(await runCli(argv, f.deps), 0);
  assert.equal(f.calls[0].file, '/usr/bin/security');
  assert.deepEqual(f.calls[0].args, [
    'find-generic-password',
    '-s',
    'tuturuuu-bot-private-key',
    '-w',
  ]);
  assert.equal(f.calls[0].options.stdio[2], 'ignore');
  const mint = f.calls[1];
  assert.equal(
    mint.url,
    'https://api.github.com/app/installations/456/access_tokens'
  );
  assert.equal(mint.options.redirect, 'error');
  assert.deepEqual(JSON.parse(mint.options.body), {
    repositories: ['platform'],
    permissions: {
      metadata: 'read',
      contents: 'write',
      pull_requests: 'write',
    },
  });
  const child = f.calls[2];
  assert.equal(child.command, 'gh');
  assert.equal(child.options.env.GH_TOKEN, token);
  assert.equal(child.options.env.GITHUB_TOKEN, token);
  assert.equal(child.options.env.TUTURUUU_BOT_APP_ID, undefined);
  assert.equal(child.options.shell, false);
  assert.equal(f.calls[3].options.method, 'DELETE');
  assert.equal(f.calls[3].url, 'https://api.github.com/installation/token');
  assert.equal(f.output(), '');
});

test('git credentials use ephemeral config and propagate failure while revoking', async () => {
  const f = fixture({
    spawn: (command, args, options) => {
      assert.equal(command, 'git');
      assert.deepEqual(args.slice(0, 4), [
        '-c',
        'credential.helper=',
        '-c',
        'credential.helper=!gh auth git-credential',
      ]);
      assert.equal(options.env.GH_TOKEN, token);
      return { status: 7 };
    },
  });
  assert.equal(
    await runCli(
      [...argv.slice(0, 3), 'git', 'push', 'origin', 'HEAD'],
      f.deps
    ),
    7
  );
  assert.equal(f.calls.at(-1).options.method, 'DELETE');
});

test('rejects raw key, file key, output modes, unknown scopes and arbitrary executables', async () => {
  assert.throws(
    () => loadPrivateKey({ TUTURUUU_BOT_PRIVATE_KEY: 'secret' }),
    /forbidden/
  );
  assert.throws(
    () => loadPrivateKey({ TUTURUUU_BOT_PRIVATE_KEY_PATH: '/secret' }),
    /forbidden/
  );
  for (const args of [
    ['--json'],
    ['--private-key', 'secret'],
    ['--permissions', 'contents=read', '--', 'gh', 'auth', 'token'],
    [
      '--permissions',
      'pull_requests=write',
      '--',
      'gh',
      'pr',
      'review',
      '--approve',
    ],
    ['--permissions', 'workflows=write', '--', 'gh', 'pr'],
    ['--permissions', 'contents=admin', '--', 'gh', 'pr'],
    ['--permissions', 'contents=read', '--', 'sh', '-c', 'env'],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test('real signer creates verifiable short-lived RS256 claims', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwt = createAppJwt('123', privateKey, 1000);
  const parts = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(parts[1], 'base64url')), {
    iat: 940,
    exp: 1540,
    iss: '123',
  });
  assert.ok(
    crypto.verify(
      'RSA-SHA256',
      Buffer.from(parts.slice(0, 2).join('.')),
      publicKey,
      Buffer.from(parts[2], 'base64url')
    )
  );
});

test('external errors never expose secrets; child errors still revoke', async () => {
  for (const stage of ['read', 'sign', 'fetchImpl', 'spawn']) {
    const fail = () => {
      throw new Error(`mock-private-key ${token}`);
    };
    const f = fixture({ [stage]: fail });
    assert.equal(await runCli(argv, f.deps), 1);
    assert.doesNotMatch(f.output(), /mock-private-key|ghs_fake/);
    if (stage === 'spawn')
      assert.equal(f.calls.at(-1).options.method, 'DELETE');
  }
});

test('revocation failure is visible and fails the command', async () => {
  const f = fixture({
    fetchImpl: async (_url, options) => ({
      ok: options.method !== 'DELETE',
      json: async () => ({ token }),
    }),
  });
  assert.equal(await runCli(argv, f.deps), 1);
  assert.match(f.output(), /revocation failed/);
  assert.doesNotMatch(f.output(), /ghs_fake/);
});
