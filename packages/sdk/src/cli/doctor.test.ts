import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLI_EXIT } from './cli-contracts';
import { createCredentialStore } from './credential-store';
import { doctorHelp, runDoctorCommand } from './doctor';

const secret = 'synthetic-doctor-token';
const version = process.versions.node;
const healthyFetch = () =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
let homeDir: string;
let exitCode: typeof process.exitCode;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), 'ttr-doctor-'));
  exitCode = process.exitCode;
});

afterEach(async () => {
  process.exitCode = exitCode;
  await rm(homeDir, { recursive: true, force: true });
});

describe('doctor', () => {
  it('runs all default checks, emits JSON, and leaves credentials untouched', async () => {
    const env = {
      TTR_UPSKII_QA_TOKEN_STAGING: secret,
      SUPABASE_URL: `https://${secret}.example.test`,
    };
    const credentialStore = createCredentialStore({
      homeDir,
      platform: 'freebsd',
      env,
    });
    const fetch = healthyFetch();
    const write = vi.fn();
    await runDoctorCommand(['--json'], {
      fetch,
      env,
      homeDir,
      credentialStore,
      write,
    });
    const output = write.mock.calls[0]?.[0];
    const report = JSON.parse(output);
    expect(report).toMatchObject({
      ok: true,
      env: 'staging',
      checkedAt: expect.any(String),
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cli',
          status: 'ok',
          summary: expect.stringContaining(version),
        }),
        expect.objectContaining({
          id: 'credentials',
          summary: expect.stringContaining('file'),
        }),
        expect.objectContaining({ id: 'upskii.qa-token', status: 'ok' }),
        expect.objectContaining({ id: 'db.supabase', status: 'warn' }),
        expect.objectContaining({ id: 'db.environment', status: 'ok' }),
      ])
    );
    expect(output).not.toContain(secret);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://staging.admin.upskii.com',
      'https://staging.app.upskii.com',
      'https://staging.upskii.com',
      'https://web.tutur3u.com',
      'https://infra.tutur3u.com',
    ]);
    for (const [, request] of fetch.mock.calls) {
      expect(request).toEqual({
        method: 'HEAD',
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      });
    }
    expect(process.exitCode).toBe(CLI_EXIT.ok);
    await expect(stat(join(homeDir, '.tuturuuu'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('filters by family, probes pinned prod origins and reports expired profiles by environment', async () => {
    const credentialStore = createCredentialStore({
      homeDir,
      platform: 'freebsd',
      env: {},
    });
    await credentialStore.set({
      backend: 'file',
      family: 'upskii-qa',
      env: 'prod',
      scopes: [secret.slice(0, 7)],
      secret,
      expiresAt: '2000-01-01T00:00:00.000Z',
    });
    await credentialStore.set({
      backend: 'file',
      family: 'upskii-qa',
      env: 'staging',
      scopes: [],
      secret: 'staging-fixture',
    });
    const fetch = healthyFetch();
    const write = vi.fn();
    await runDoctorCommand(['--env', 'prod', '--family=upskii', '--json'], {
      env: {
        TTR_ENV: 'staging',
        UPSKII_LOCAL_AUTH_URL: 'http://localhost:7777',
      },
      fetch,
      credentialStore,
      write,
    });
    const output = write.mock.calls[0]?.[0];
    const report = JSON.parse(output);
    expect(report).toMatchObject({ ok: true, env: 'prod' });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'credentials.upskii-qa',
          status: 'warn',
          summary: '1 upskii-qa profile(s) in prod, 1 expired.',
        }),
        expect.objectContaining({ id: 'upskii.qa-token', status: 'warn' }),
      ])
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain('credentials.infra');
    expect(output).not.toContain('db.supabase');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://admin.upskii.com',
      'https://app.upskii.com',
      'https://upskii.com',
    ]);
    expect(process.exitCode).toBe(CLI_EXIT.ok);

    const infraFetch = healthyFetch();
    const infraWrite = vi.fn();
    await runDoctorCommand(['--env', 'prod', '--family=infra', '--json'], {
      env: {},
      fetch: infraFetch,
      credentialStore,
      write: infraWrite,
    });
    expect(infraFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://tuturuuu.com',
      'https://tuturuuu.com/admin',
    ]);
    expect(process.exitCode).toBe(CLI_EXIT.ok);
  });

  it('marks critical probe failures unavailable without printing error details', async () => {
    const fetch = healthyFetch()
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const write = vi.fn();
    await runDoctorCommand(['--family', 'infra', '--no-color'], {
      fetch,
      env: {},
      homeDir,
      write,
    });
    const output = write.mock.calls[0]?.[0];
    expect(output).toContain('[ENV: STAGING]');
    expect(output).toMatch(/FAIL +infra\.web/u);
    expect(output).toContain('503');
    expect(output).not.toContain(secret);
    expect(process.exitCode).toBe(CLI_EXIT.unavailable);
  });

  it('makes no network calls for local-only checks or help', async () => {
    const fetch = healthyFetch();
    const write = vi.fn();
    const deps = { fetch, env: { TTR_ENV: 'sandbox' }, homeDir, write };
    await runDoctorCommand(['--family', 'local', '--json'], deps);
    expect(JSON.parse(write.mock.calls[0]?.[0])).toMatchObject({
      env: 'sandbox',
      ok: true,
    });
    await runDoctorCommand(['--help'], deps);
    expect(write).toHaveBeenLastCalledWith(`${doctorHelp()}\n`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid and secret options before probing', async () => {
    const fetch = healthyFetch();
    const deps = { fetch, homeDir, write: vi.fn(), env: {} };
    await expect(
      runDoctorCommand(['--family', 'other'], deps)
    ).rejects.toMatchObject({ code: 'INVALID_DOCTOR_OPTIONS' });
    await expect(
      runDoctorCommand(['--env', 'constructor'], deps)
    ).rejects.toMatchObject({ code: 'INVALID_DOCTOR_OPTIONS' });
    await expect(
      runDoctorCommand([`--token=${secret}`], deps)
    ).rejects.toMatchObject({ code: 'SECRET_IN_CLI_FLAG' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
