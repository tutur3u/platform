const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  '--head',
  'chore/test',
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
      assert.deepEqual(args.slice(4), [
        '-c',
        'push.followTags=false',
        '-c',
        'core.hooksPath=/dev/null',
        'push',
        '--no-verify',
        'https://github.com/tutur3u/platform.git',
        'HEAD:refs/heads/chore/test',
      ]);
      assert.equal(options.env.GH_TOKEN, token);
      return { status: 7 };
    },
  });
  assert.equal(
    await runCli(
      [...argv.slice(0, 3), 'git', 'push', 'origin', 'HEAD:chore/test'],
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

test('local scopes exclude actions, issues, workflow, checks, admin and explicit metadata', () => {
  for (const scope of [
    'actions',
    'issues',
    'workflows',
    'checks',
    'administration',
    'metadata',
  ]) {
    assert.throws(() =>
      parseArgs(['--permissions', `${scope}=write`, '--', 'gh', 'pr', 'create'])
    );
  }
});

test('git push accepts exactly one explicit task-branch HEAD refspec', () => {
  const prefix = ['--permissions', 'contents=write', '--', 'git', 'push'];
  assert.equal(
    parseArgs([...prefix, 'origin', 'HEAD:fix/x']).command.at(-1),
    'HEAD:fix/x'
  );
  for (const args of [
    ['origin', 'HEAD'],
    ['origin'],
    ['origin', 'main'],
    ['origin', 'HEAD:main'],
    ['origin', 'HEAD:production'],
    ['origin', 'HEAD:refs/tags/v1'],
    ['origin', 'HEAD:refs/heads/fix/x'],
    ['origin', 'HEAD:release-please--branches--production'],
    ['origin', 'HEAD:fix/a', 'HEAD:fix/b'],
    ['origin', ':fix/a'],
    ['origin', '+HEAD:fix/a'],
    ['origin', 'HEAD:fix/../x'],
    ['origin', 'HEAD:fix/x.lock'],
    ['origin', 'HEAD:fix//x'],
    ['elsewhere', 'HEAD:fix/x'],
    ...[
      '--force',
      '--force-with-lease',
      '--force-if-includes',
      '--delete',
      '-d',
      '--mirror',
      '--all',
      '--tags',
      '--receive-pack',
      '--exec',
      '-f',
    ].map((flag) => ['origin', flag, 'HEAD:fix/x']),
    ['origin', 'HEAD:fix/x', '--force'],
    ['origin', '--receive-pack=evil', 'HEAD:fix/x'],
    ['origin', '--exec=evil', 'HEAD:fix/x'],
  ])
    assert.throws(() => parseArgs([...prefix, ...args]), args.join(' '));
});

test('rejected commands never access the Keychain or mint a token', async () => {
  for (const command of [
    ['git', 'push', 'origin', '--mirror'],
    ['gh', 'pr', 'review', '--approve'],
    ['gh', 'pr', 'review', '-a'],
  ]) {
    const f = fixture();
    assert.equal(await runCli([...argv.slice(0, 3), ...command], f.deps), 1);
    assert.deepEqual(f.calls, []);
  }
});

test('child environment drops auth tracing and personal Git config overrides', async () => {
  const f = fixture();
  Object.assign(f.deps.env, {
    GH_DEBUG: 'api',
    GIT_TRACE_CURL: '1',
    GIT_CURL_VERBOSE: '1',
    GIT_CONFIG_COUNT: '1',
  });
  assert.equal(await runCli(argv, f.deps), 0);
  const env = f.calls[2].options.env;
  for (const name of [
    'GH_DEBUG',
    'GIT_TRACE_CURL',
    'GIT_CURL_VERBOSE',
    'GIT_CONFIG_COUNT',
  ])
    assert.equal(env[name], undefined);
  assert.equal(env.GH_REPO, 'tutur3u/platform');
  assert.equal(env.GH_PROMPT_DISABLED, '1');
});

test('PR creation requires one explicit task-branch head before accessing credentials', async () => {
  const prefix = [
    '--permissions',
    'pull_requests=write',
    '--',
    'gh',
    'pr',
    'create',
  ];
  assert.equal(parseArgs([...prefix, '--head', 'fix/x']).branch, 'fix/x');
  assert.equal(
    parseArgs([
      ...prefix,
      '--title',
      'A change',
      '--head',
      'chore/test',
      '--draft',
    ]).branch,
    'chore/test'
  );
  for (const args of [
    [],
    ['--head'],
    ['--head', 'main'],
    ['--head', 'production'],
    ['--head', 'refs/heads/fix/x'],
    ['--head', 'vhpx:fix/x'],
    ['--head', 'release-please--branches--production'],
    ['--head', 'fix/../x'],
    ['--head', 'fix/x', '--head', 'fix/y'],
    ['--head=fix/x'],
    ['--title', '--head', 'fix/x'],
    ['--body', '--head'],
    ['--head', 'fix/x', '--repo', 'someone/else'],
  ]) {
    const f = fixture();
    assert.equal(
      await runCli([...prefix, ...args], f.deps),
      1,
      JSON.stringify(args)
    );
    assert.deepEqual(f.calls, []);
  }
});

test('gh prompts are disabled even if the caller enables them', async () => {
  const f = fixture();
  f.deps.env.GH_PROMPT_DISABLED = '0';
  f.deps.spawn = (_command, args, options) => {
    assert.equal(options.env.GH_PROMPT_DISABLED, '1');
    assert.deepEqual(args.slice(-2), ['--head', 'chore/test']);
    return { status: 0 };
  };
  assert.equal(await runCli(argv, f.deps), 0);
});

test('real Git push runs no local hook and does not follow reachable tags', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuturuuu-bot-push-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'source');
  const remote = path.join(dir, 'remote.git');
  const marker = path.join(dir, 'hook-ran');
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  fs.mkdirSync(repo);
  git(['init', '--initial-branch=chore/source']);
  git(['init', '--bare', remote]);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['commit', '--allow-empty', '-m', 'test: seed']);
  git(['tag', '-a', 'v-test', '-m', 'test tag']);
  git(['config', 'push.followTags', 'true']);
  const hooks = path.join(dir, 'hostile-hooks');
  fs.mkdirSync(hooks);
  git(['config', 'core.hooksPath', hooks]);
  fs.writeFileSync(
    path.join(hooks, 'pre-push'),
    `#!/bin/sh\ntouch '${marker}'\nexit 1\n`,
    { mode: 0o700 }
  );
  const f = fixture({
    spawn: (command, args, options) => {
      const urlIndex = args.indexOf('https://github.com/tutur3u/platform.git');
      assert.ok(urlIndex > 0);
      const local = [...args];
      local[urlIndex] = remote;
      return spawnSync(command, local, {
        ...options,
        cwd: repo,
        stdio: 'pipe',
      });
    },
  });
  assert.equal(
    await runCli(
      [...argv.slice(0, 3), 'git', 'push', 'origin', 'HEAD:chore/test'],
      f.deps
    ),
    0
  );
  assert.equal(fs.existsSync(marker), false);
  assert.match(
    git(['--git-dir', remote, 'show-ref', '--verify', 'refs/heads/chore/test']),
    /refs\/heads\/chore\/test/
  );
  assert.equal(
    spawnSync(
      'git',
      [
        '--git-dir',
        remote,
        'show-ref',
        '--verify',
        '--quiet',
        'refs/tags/v-test',
      ],
      { stdio: 'ignore' }
    ).status,
    1
  );
});
