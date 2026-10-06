import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeSigningBundle } from './vault-bundle.mjs';
import {
  assertVaultRunner,
  BUNDLE_URL,
  boundedJson,
  fetchSigningBundle,
  mask,
} from './vault-fetch.mjs';
import {
  packageChild,
  privateDirectory,
  signingEnvironment,
  signVaultBundle,
  stopSignerTree,
} from './vault-signing.mjs';

const host = () => ({
  DESKTOP_SIGNING_SOURCE: 'vault',
  DESKTOP_PLATFORM: 'windows',
  RUNNER_OS: 'Windows',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_REF: 'refs/heads/production',
  GITHUB_WORKFLOW_REF:
    'tutur3u/platform/.github/workflows/desktop-beta.yaml@refs/heads/production',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40),
  RUNNER_TEMP: '/fixture',
  DESKTOP_VAULT_CI_TOKEN: `ttr_desktop_ci_${'A'.repeat(43)}`,
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://token.actions.githubusercontent.com/id?x=1',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-oidc-request-token',
});
const file = (name, bytes = Buffer.from('fixture-certificate')) => ({
  name,
  base64: bytes.toString('base64'),
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});
const bundle = (platform = 'windows') => ({
  schemaVersion: 1,
  platform,
  versionId: 'a1234567-1234-1234-1234-123456789012',
  files:
    platform === 'windows'
      ? [file('windows_authenticode_certificate_pfx')]
      : [
          file('macos_developer_id_certificate_p12'),
          file('macos_notarization_private_key_p8'),
        ],
  scalars:
    platform === 'windows'
      ? { WINDOWS_SIGNING_CERTIFICATE_PASSWORD: 'fixture-password' }
      : {
          MACOS_CERTIFICATE_PASSWORD: 'fixture-password',
          MACOS_SIGNING_IDENTITY: 'Developer ID Application: Fixture',
          APPLE_TEAM_ID: 'ABCDEFGHIJ',
          APP_STORE_CONNECT_API_KEY_ID: 'ABCDEFGHIJ',
          APP_STORE_CONNECT_ISSUER_ID: 'a1234567-1234-1234-1234-123456789012',
        },
});

test('native runner imports the same pure canonical profiles as server', () => {
  assert.equal(
    decodeSigningBundle(bundle(), 'windows')
      .WINDOWS_SIGNING_CERTIFICATE_PASSWORD,
    'fixture-password'
  );
  assert.equal(
    Object.keys(decodeSigningBundle(bundle('macos'), 'macos')).length,
    7
  );
});
for (const [name, alter] of Object.entries({
  unknown: (b) => {
    b.extra = 'value';
  },
  crossPlatform: (b) => {
    b.platform = 'macos';
  },
  duplicateFile: (b) => {
    b.files.push(b.files[0]);
  },
  otherFile: (b) => {
    b.files[0].name = 'macos_notarization_private_key_p8';
  },
  wrongHash: (b) => {
    b.files[0].sha256 = 'a'.repeat(64);
  },
  wrongSize: (b) => {
    b.files[0].size += 1;
  },
  nonCanonicalBase64: (b) => {
    b.files[0].base64 += '\n';
  },
  unknownScalar: (b) => {
    b.scalars.GITHUB_ENV = 'private';
  },
  controlScalar: (b) => {
    b.scalars.WINDOWS_SIGNING_CERTIFICATE_PASSWORD = 'private\n';
  },
  oversizedScalar: (b) => {
    b.scalars.WINDOWS_SIGNING_CERTIFICATE_PASSWORD = 'x'.repeat(32769);
  },
}))
  test(`reject ${name} without forwarding private bytes`, () => {
    const value = bundle();
    alter(value);
    assert.throws(() => decodeSigningBundle(value, 'windows'), {
      message: 'Desktop signing bundle rejected',
    });
  });
for (const patch of [
  { DESKTOP_PLATFORM: 'linux' },
  { GITHUB_REF: 'refs/pull/1/merge' },
  {
    GITHUB_WORKFLOW_REF:
      'tutur3u/platform/.github/workflows/desktop-store-draft.yaml@refs/heads/production',
  },
  { GITHUB_EVENT_NAME: 'pull_request' },
  { GITHUB_REPOSITORY: 'untrusted/repo' },
  { RUNNER_OS: 'macOS' },
  { DESKTOP_SIGNING_SOURCE: '' },
  {
    ACTIONS_ID_TOKEN_REQUEST_URL:
      'https://token.actions.githubusercontent.com.attacker.test/id',
  },
  {
    ACTIONS_ID_TOKEN_REQUEST_URL:
      'https://user@token.actions.githubusercontent.com/id',
  },
])
  test(`reject invalid protected runner ${JSON.stringify(patch)}`, () => {
    assert.throws(() => assertVaultRunner({ ...host(), ...patch }), {
      message: 'Desktop vault admission failed',
    });
  });
test('OIDC request audience and fixed bundle destination; secrets masked before each request', async () => {
  const calls = [];
  const masked = [];
  const value = await fetchSigningBundle(host(), {
    hide: (v) => masked.push(v),
    request: async (url, options) => {
      calls.push({ url: String(url), options, masked: [...masked] });
      return Response.json(
        calls.length === 1 ? { value: 'fixture.jwt.signature' } : bundle()
      );
    },
  });
  assert.equal(value.platform, 'windows');
  assert.equal(
    new URL(calls[0].url).searchParams.get('audience'),
    'tuturuuu-desktop-deployment'
  );
  assert.equal(calls[1].url, BUNDLE_URL);
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[1].options.body, '{"platform":"windows"}');
  assert(calls[0].masked.includes(host().DESKTOP_VAULT_CI_TOKEN));
  assert(calls[1].masked.includes('fixture.jwt.signature'));
});
test('failure is fixed and never retries consumed bundle admission', async () => {
  let count = 0;
  await assert.rejects(
    fetchSigningBundle(host(), {
      hide: () => {},
      request: async () => {
        count += 1;
        if (count === 1)
          return Response.json({ value: 'fixture.jwt.signature' });
        throw new Error('raw sensitive upstream response');
      },
    }),
    { message: 'Desktop vault admission failed' }
  );
  assert.equal(count, 2);
});
test('actual streamed response bound rejects understated length and malformed body', async () => {
  await assert.rejects(
    boundedJson(
      new Response('x'.repeat(100), { headers: { 'Content-Length': '1' } }),
      10
    ),
    /admission failed/
  );
  await assert.rejects(
    boundedJson(new Response('{"bad"'), 100),
    /admission failed/
  );
  await assert.rejects(
    boundedJson(new Response('raw sensitive denial', { status: 403 }), 100),
    /admission failed/
  );
});
test('mask command escapes workflow control bytes', () => {
  let output = '';
  mask('a%\r\nb', (line) => {
    output += line;
  });
  assert.equal(output, '::add-mask::a%25%0D%0Ab\n');
});
test('child environment strips tokens, GitHub output paths and other-OS credentials', () => {
  const env = signingEnvironment(
    {
      ...host(),
      PATH: '/bin',
      GITHUB_ENV: '/private',
      GH_TOKEN: 'private',
      APP_STORE_CONNECT_PRIVATE_KEY_P8_B64: 'other-os-private',
      ARBITRARY_SECRET: 'private',
    },
    decodeSigningBundle(bundle(), 'windows'),
    '/isolated'
  );
  assert.equal(env.PATH, '/bin');
  assert.equal(env.RUNNER_TEMP, '/fixture');
  assert.equal(env.DESKTOP_SIGNING_TEMP, '/isolated');
  for (const name of [
    'DESKTOP_VAULT_CI_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'GITHUB_ENV',
    'GH_TOKEN',
    'APP_STORE_CONNECT_PRIVATE_KEY_P8_B64',
    'ARBITRARY_SECRET',
  ])
    assert.equal(env[name], undefined);
});
test('Windows ACL is set before returning an empty private directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-acl-test-'));
  let call;
  try {
    const path = await privateDirectory(
      { ...host(), RUNNER_TEMP: root, USERDOMAIN: 'RUNNER', USERNAME: 'admin' },
      (...args) => {
        call = args;
      }
    );
    assert.equal(call[0], 'icacls.exe');
    assert.deepEqual(call[1], [
      path,
      '/inheritancelevel:r',
      '/grant:r',
      'RUNNER\\admin:(OI)(CI)F',
    ]);
    assert.deepEqual(await readdir(path), []);
    await assert.rejects(
      privateDirectory({
        ...host(),
        RUNNER_TEMP: root,
        USERDOMAIN: 'bad;command',
        USERNAME: 'admin',
      }),
      /directory admission failed/
    );
    assert.equal((await readdir(root)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
for (const failure of [false, true])
  test(`owned signing directory and env removed after child ${failure ? 'failure' : 'success'}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-private-test-'));
    let child;
    let path;
    try {
      const promise = signVaultBundle(
        { ...host(), DESKTOP_PLATFORM: 'macos', RUNNER_TEMP: root },
        bundle('macos'),
        {
          hide: () => {},
          sign: async (env) => {
            child = env;
            path = env.DESKTOP_SIGNING_TEMP;
            assert.equal((await stat(path)).mode & 0o777, 0o700);
            assert.equal(env.RUNNER_TEMP, root);
            if (failure) throw new Error('raw secret child error');
          },
        }
      );
      if (failure)
        await assert.rejects(promise, {
          message: 'Desktop vault signing failed; no package was published',
        });
      else await promise;
      assert.deepEqual(Object.keys(child), []);
      await assert.rejects(stat(path), { code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
test('invalid bundle never creates private directory or launches signing', async () => {
  let touched = false;
  await assert.rejects(
    signVaultBundle(
      host(),
      { raw: 'secret' },
      {
        directory: async () => {
          touched = true;
        },
        sign: async () => {
          touched = true;
        },
      }
    ),
    /vault signing failed/
  );
  assert.equal(touched, false);
});
test('vault workflow only fetches after compilation with explicit opt-in and separate OS tokens', () => {
  const workflow = readFileSync('.github/workflows/desktop-beta.yaml', 'utf8');
  const windows = workflow.indexOf(
    'Sign Windows beta with Infrastructure vault'
  );
  const mac = workflow.indexOf('Sign macOS beta with Infrastructure vault');
  assert(windows > workflow.indexOf('Build Windows beta'));
  assert(mac > workflow.indexOf('Build macOS beta'));
  assert.match(
    workflow.slice(windows, mac),
    /matrix.platform == 'windows' && vars.DESKTOP_SIGNING_SOURCE == 'vault'/
  );
  assert.match(
    workflow.slice(windows, mac),
    /secrets.DESKTOP_WINDOWS_VAULT_CI_TOKEN/
  );
  assert.match(
    workflow.slice(mac, workflow.indexOf('Sign and package Windows beta')),
    /secrets.DESKTOP_MACOS_VAULT_CI_TOKEN/
  );
  assert.match(
    workflow,
    /matrix.platform == 'windows' && vars.DESKTOP_SIGNING_SOURCE != 'vault'/
  );
  assert.match(
    workflow,
    /matrix.platform == 'macos' && vars.DESKTOP_SIGNING_SOURCE != 'vault'/
  );
  const linux = workflow.slice(
    workflow.indexOf('Audit and package beta'),
    windows
  );
  assert(!linux.includes('package-vault-ci.mjs'));
  assert(!linux.includes('VAULT_CI_TOKEN'));
  assert.match(
    workflow,
    /permissions:\n {6}contents: read\n {6}deployments: read\n {6}id-token: write/
  );
});

for (const result of ['success', 'failed', 'cancelled', 'spawn-error'])
  test(`signer child ${result} suppresses output and removes signal handlers`, async () => {
    const child = new EventEmitter();
    child.pid = 123;
    const beforeTerm = process.listenerCount('SIGTERM');
    const beforeInt = process.listenerCount('SIGINT');
    let options;
    let stopped = false;
    const promise = packageChild(
      { DESKTOP_PLATFORM: 'windows' },
      {
        launch: (_command, _args, opts) => {
          options = opts;
          return child;
        },
        stopTree: (owned, platform) => {
          assert.equal(owned, child);
          assert.equal(platform, 'windows');
          stopped = true;
        },
      }
    );
    assert.equal(options.stdio, 'ignore');
    if (result === 'cancelled') process.emit('SIGTERM');
    if (result === 'spawn-error')
      child.emit('error', new Error('raw credential spawn diagnostics'));
    else child.emit('close', result === 'failed' ? 1 : 0);
    if (result === 'success') await promise;
    else
      await assert.rejects(promise, {
        message: 'Desktop signing child failed',
      });
    assert.equal(stopped, result === 'cancelled');
    assert.equal(process.listenerCount('SIGTERM'), beforeTerm);
    assert.equal(process.listenerCount('SIGINT'), beforeInt);
  });
test('Windows cancellation targets only exact owned signer PID/tree', () => {
  let args;
  stopSignerTree({ pid: 123 }, 'windows', (...value) => {
    args = value;
  });
  assert.deepEqual(args, [
    'taskkill.exe',
    ['/PID', '123', '/T', '/F'],
    { stdio: 'ignore' },
  ]);
  args = undefined;
  stopSignerTree({ pid: -1 }, 'windows', (...value) => {
    args = value;
  });
  assert.equal(args, undefined);
});

test('oversized response chunk is erased before rejection', async () => {
  const bytes = new Uint8Array(100).fill(65);
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    })
  );
  await assert.rejects(boundedJson(response, 10), /admission failed/);
  assert(bytes.every((byte) => byte === 0));
});
test('wire-valid large material fails portable environment admission before signing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-env-bound-test-'));
  let launched = false;
  try {
    const value = bundle('macos');
    value.files[0] = file(
      'macos_developer_id_certificate_p12',
      Buffer.alloc(30000, 65)
    );
    await assert.rejects(
      signVaultBundle(
        { ...host(), DESKTOP_PLATFORM: 'macos', RUNNER_TEMP: root },
        value,
        {
          hide: () => {},
          sign: async () => {
            launched = true;
          },
        }
      ),
      /vault signing failed/
    );
    assert.equal(launched, false);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancellation kills a real TERM-resistant descendant with the still-owned process group', {
  skip: process.platform === 'win32',
  timeout: 5000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-process-group-test-'));
  const marker = join(root, 'survived');
  let parent;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });
  const descendantSource = `require('node:process').on('SIGTERM',()=>{});process.stdout.write('ready');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'survived'),400);setInterval(()=>{},10000)`;
  const parentSource = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendantSource)}],{stdio:['ignore','pipe','ignore']});child.stdout.on('data',chunk=>process.stdout.write(chunk));setInterval(()=>{},10000)`;
  const completion = packageChild(
    { DESKTOP_PLATFORM: 'macos' },
    {
      launch: (_command, _args, options) => {
        parent = spawn(process.execPath, ['-e', parentSource], {
          ...options,
          env: {},
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        parent.stdout.once('data', () => readyResolve());
        return parent;
      },
    }
  );
  // Attach the assertion before cancellation so a fast close cannot be unhandled.
  const rejected = assert.rejects(completion, /signing child failed/);
  try {
    await ready;
    process.emit('SIGTERM');
    await rejected;
    await delay(550);
    await assert.rejects(stat(marker), { code: 'ENOENT' });
  } finally {
    if (parent?.exitCode === null && parent?.signalCode === null)
      stopSignerTree(parent, 'macos');
    await rm(root, { recursive: true, force: true });
  }
});
