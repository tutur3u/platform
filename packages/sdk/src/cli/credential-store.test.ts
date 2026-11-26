import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLI_EXIT } from './cli-contracts';
import {
  assertNoCredentialLeak,
  createCredentialStore,
  keychainServiceName,
  redactSecrets,
  rejectSecretFlags,
} from './credential-store';

const key = { family: 'upskii-qa', env: 'staging' } as const;
const secret = 'fixture-credential-1234';
const input = { ...key, secret, scopes: ['qa:create'] };
let homeDir: string;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), 'ttr-credentials-'));
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true });
});

describe('credential store', () => {
  it('writes Keychain secrets over stdin and reads and removes the selected profile', async () => {
    let stored: string | undefined;
    const service = keychainServiceName(key.family, key.env);
    const exec = vi.fn(async (_cmd: string, args: string[], stdin?: string) => {
      if (args[0] === '-i') {
        const prefix = `add-generic-password -U -s ${service} -a deploy -X `;
        expect(stdin?.startsWith(prefix)).toBe(true);
        stored = Buffer.from(
          stdin?.slice(prefix.length).trim() ?? '',
          'hex'
        ).toString('utf8');
      }
      if (args[0] === 'delete-generic-password') stored = undefined;
      return {
        ok: true,
        stdout: args[0] === 'find-generic-password' ? `${stored}\n` : '',
        stderr: '',
      };
    });
    const store = createCredentialStore({
      homeDir,
      platform: 'darwin',
      env: {},
      exec,
    });
    expect(await store.preferredBackend()).toBe('keychain');
    const metadata = await store.set({ ...input, profile: 'deploy' });
    expect(metadata).toMatchObject({
      ...key,
      backend: 'keychain',
      profile: 'deploy',
    });
    expect(await store.get({ ...key, profile: 'deploy' })).toEqual({
      ...metadata,
      secret,
    });
    expect(await store.get(key)).toBeNull();
    expect(await store.list({ env: 'prod' })).toEqual([]);
    expect(await store.list({ family: key.family })).toEqual([metadata]);
    expect(
      await readFile(join(homeDir, '.tuturuuu', 'profiles.json'), 'utf8')
    ).not.toContain(secret);
    expect(exec.mock.calls.flatMap(([, args]) => args)).not.toContain(secret);
    expect(await store.delete({ ...key, profile: 'deploy' })).toBe(true);
    expect(await store.delete({ ...key, profile: 'deploy' })).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('binds env-var credentials to their target environment without probing or writing', async () => {
    const exec = vi.fn();
    // Unscoped env var without env binding must NOT cross-send to staging (M1)
    const unbound = createCredentialStore({
      homeDir,
      exec,
      env: { TTR_UPSKII_QA_TOKEN: secret },
    });
    expect(await unbound.get(key)).toBeNull();

    // Env-scoped variable matches only its own environment
    const scoped = createCredentialStore({
      homeDir,
      exec,
      env: {
        TTR_UPSKII_QA_TOKEN_STAGING: secret,
        TTR_UPSKII_QA_TOKEN_PROD: 'prod-only-secret-9999',
      },
    });
    expect(await scoped.get(key)).toMatchObject({
      ...key,
      backend: 'env',
      secret,
    });
    expect(
      await scoped.get({ family: 'upskii-qa', env: 'prod' })
    ).toMatchObject({
      env: 'prod',
      backend: 'env',
      secret: 'prod-only-secret-9999',
    });
    expect(exec).not.toHaveBeenCalled();
    await expect(stat(join(homeDir, '.tuturuuu'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const file = createCredentialStore({
      homeDir,
      platform: 'freebsd',
      env: {},
    });
    await file.set({ ...input, backend: 'file' });
    const override = createCredentialStore({
      homeDir,
      env: {
        UPSKII_QA_PROVISIONER_TOKEN: 'override-fixture',
        UPSKII_QA_PROVISIONER_TOKEN_ENV: 'staging',
      },
    });
    expect(await override.get(key)).toMatchObject({
      backend: 'env',
      secret: 'override-fixture',
    });
    expect(await override.list()).toEqual([
      expect.objectContaining({ backend: 'file' }),
    ]);
  });

  it('refuses silent plaintext fallback and requires explicit file opt-in', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ ok: false, stdout: '', stderr: 'unavailable' });
    const store = createCredentialStore({
      homeDir,
      platform: 'linux',
      env: {},
      exec,
    });
    await expect(store.set(input)).rejects.toMatchObject({
      code: 'CREDENTIAL_STORE_UNAVAILABLE',
      exitCode: CLI_EXIT.policy,
    });
    const metadata = await store.set({ ...input, backend: 'file' });
    expect(metadata.backend).toBe('file');
    // Updating an existing file-backed profile must still require explicit backend: 'file'
    await expect(
      store.set({ ...input, secret: 'rotated-secret-value-9999' })
    ).rejects.toMatchObject({
      code: 'CREDENTIAL_STORE_UNAVAILABLE',
      exitCode: CLI_EXIT.policy,
    });
    // Bare cookie value and base64-encoded forms must be caught by assertNoCredentialLeak
    const bareCookieVal = 'sess_bare_cookie_value_987654';
    expect(() =>
      assertNoCredentialLeak(`{"leak":"${bareCookieVal}"}`, [
        `__Secure-upskii.session_token=${bareCookieVal}`,
      ])
    ).toThrow(/Credential output blocked/);
    expect(() =>
      assertNoCredentialLeak(
        Buffer.from(bareCookieVal, 'utf8').toString('base64'),
        [`__Secure-upskii.session_token=${bareCookieVal}`]
      )
    ).toThrow(/Credential output blocked/);
    const root = join(homeDir, '.tuturuuu');
    const directory = join(root, 'credentials', key.env, key.family);
    const data = join(directory, 'default.json');
    const index = join(root, 'profiles.json');
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(data)).mode & 0o777).toBe(0o600);
    expect((await stat(index)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(data, 'utf8'))).toEqual({ secret });
    expect(JSON.parse(await readFile(index, 'utf8'))).toEqual([metadata]);
    expect(await store.get(key)).toEqual({ ...metadata, secret });
    expect(await store.delete(key)).toBe(true);
    await expect(stat(data)).rejects.toMatchObject({ code: 'ENOENT' });

    // L3: expanded secret flag detection & encoded secret leak fence
    expect(() =>
      rejectSecretFlags({
        credentials: '/tmp/qa.json',
        'password-store': 'keychain',
        'token-stdin': true,
      })
    ).not.toThrow();
    for (const bad of ['jwt', 'bearer', 'pass', 'auth', 'credential']) {
      expect(() => rejectSecretFlags({ [bad]: 'val' })).toThrow();
    }
    const b64 = Buffer.from(secret, 'utf8').toString('base64');
    expect(() => assertNoCredentialLeak(`encoded:${b64}`, [secret])).toThrow();
  });

  it('uses secret-tool attributes for isolation and only sends the secret on stdin', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ ok: true, stdout: `${secret}\n`, stderr: '' })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' });
    const store = createCredentialStore({
      homeDir,
      platform: 'linux',
      env: {},
      exec,
    });
    expect(await store.set(input)).toMatchObject({ backend: 'secret-tool' });
    expect(await store.get(key)).toMatchObject({ secret });
    expect(await store.delete(key)).toBe(true);
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'secret-tool',
      [
        'store',
        '--label=Tuturuuu CLI credential',
        'service',
        keychainServiceName(key.family, key.env),
        'profile',
        'default',
      ],
      secret
    );
  });

  it('stores only protected DPAPI bytes on disk and decrypts through stdin', async () => {
    const protectedValue = Buffer.from('protected fixture').toString('base64');
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, stdout: protectedValue, stderr: '' })
      .mockResolvedValueOnce({
        ok: true,
        stdout: Buffer.from(secret).toString('base64'),
        stderr: '',
      });
    const store = createCredentialStore({
      homeDir,
      platform: 'win32',
      env: {},
      exec,
    });
    expect(await store.preferredBackend()).toBe('dpapi');
    expect(await store.set(input)).toMatchObject({ backend: 'dpapi' });
    expect(await store.get(key)).toMatchObject({ secret });
    const path = join(
      homeDir,
      '.tuturuuu',
      'credentials',
      key.env,
      key.family,
      'default.json'
    );
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      protectedValue,
    });
    expect(exec).toHaveBeenLastCalledWith(
      'powershell.exe',
      expect.any(Array),
      protectedValue
    );
  });

  it('rejects traversal, non-persistent backends and credential-bearing metadata', async () => {
    const store = createCredentialStore({
      homeDir,
      platform: 'freebsd',
      env: {},
    });
    await expect(
      store.set({ ...input, profile: '../escape' })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIAL_PROFILE',
    });
    await expect(store.set({ ...input, backend: 'env' })).rejects.toMatchObject(
      {
        code: 'INVALID_CREDENTIAL_METADATA',
      }
    );
    await expect(
      store.set({
        ...input,
        backend: 'file',
        origin: `https://example.test/?secret=${secret}`,
      })
    ).rejects.toMatchObject({ code: 'CREDENTIAL_LEAK_BLOCKED' });
    expect(await store.list()).toEqual([]);
  });

  it('refuses a symlinked credential root', async () => {
    await symlink(homeDir, join(homeDir, '.tuturuuu'), 'dir');
    const store = createCredentialStore({
      homeDir,
      platform: 'freebsd',
      env: {},
    });
    await expect(store.set({ ...input, backend: 'file' })).rejects.toThrow();
    await expect(store.list()).rejects.toThrow();
  });
});

describe('credential output safeguards', () => {
  it.each([
    'token',
    '--api-key',
    'apiKey',
    'session_cookie',
    'adminPassword',
    'client-secret',
    'extra',
  ])('rejects the %s flag without including its value', (name) => {
    expect(() => rejectSecretFlags({ [name]: secret }, ['extra'])).toThrow(
      expect.objectContaining({
        code: 'SECRET_IN_CLI_FLAG',
        exitCode: CLI_EXIT.policy,
      })
    );
  });

  it('allows regular flags and blocks literal and JSON-escaped secrets', () => {
    expect(() =>
      rejectSecretFlags({ confirm: 'remove it', reason: 'approved' })
    ).not.toThrow();
    expect(() =>
      assertNoCredentialLeak('a short entry', ['', 'short', null])
    ).not.toThrow();
    for (const value of [secret, 'value-"\\-long']) {
      expect(() =>
        assertNoCredentialLeak(JSON.stringify({ value }), [value])
      ).toThrow(
        expect.objectContaining({
          code: 'CREDENTIAL_LEAK_BLOCKED',
          exitCode: CLI_EXIT.policy,
        })
      );
    }
  });

  it('redacts overlapping secrets and escaped JSON values', () => {
    expect(redactSecrets(`${secret} fixture`, ['fixture', secret])).toBe(
      '[REDACTED] [REDACTED]'
    );
    expect(redactSecrets(JSON.stringify('some"secret'), ['some"secret'])).toBe(
      '"[REDACTED]"'
    );
  });
});
