import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialStore } from '../credential-store';
import { type RunUpskiiCommandDeps, runUpskiiCommand } from './index';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-p2-sec-'));
  tempDirs.push(dir);
  return dir;
}

async function makeStore(secrets: { admin?: string; user?: string }) {
  const homeDir = await makeTempDir();
  const store = createCredentialStore({ env: {}, homeDir, platform: 'linux' });
  if (secrets.user) {
    await store.set({
      backend: 'file',
      env: 'staging',
      family: 'upskii-user',
      profile: 'default',
      scopes: ['upskii:profile:read', 'upskii:settings:write'],
      secret: secrets.user,
    });
  }
  if (secrets.admin) {
    await store.set({
      backend: 'file',
      env: 'staging',
      family: 'upskii-admin',
      profile: 'default',
      scopes: ['upskii:admin:read'],
      secret: secrets.admin,
    });
  }
  return { homeDir, store };
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

async function execCli(cmd: string | string[], deps: RunUpskiiCommandDeps) {
  process.exitCode = undefined;
  let stdout = '';
  let stderr = '';
  const argv = Array.isArray(cmd) ? cmd : cmd.split(' ');
  await runUpskiiCommand(argv, {
    envVars: {},
    ...deps,
    write: (c) => {
      stdout += c;
    },
    writeErr: (c) => {
      stderr += c;
    },
  });
  return { exitCode: process.exitCode, stderr, stdout };
}

afterEach(async () => {
  process.exitCode = undefined;
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe('ttr external upskii P2 credential and output screening', () => {
  it('blocks decoded Unicode leaks, secret keys, SSE leaks, D1 header leaks, and refresh tokens across all auth forms', async () => {
    const adminToken = 'upskii_cli_a_unicode_leak_guard_9999';
    const userToken = 'upskii_cli_a_user_unicode_leak_8888';
    const { store } = await makeStore({ admin: adminToken, user: userToken });

    const adminLeak = await execCli('admin overview --env staging --json', {
      credentialStore: store,
      fetch: async () =>
        new Response('{"debug":"\\u0075pskii_cli_a_unicode_leak_guard_9999"}', {
          status: 200,
        }),
    });
    expect(adminLeak.exitCode).toBe(6);
    expect(adminLeak.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');

    const userLeak = await execCli('workspaces list --env staging --json', {
      credentialStore: store,
      fetch: async () =>
        new Response('{"debug":"\\u0075pskii_cli_a_user_unicode_leak_8888"}', {
          status: 200,
        }),
    });
    expect(userLeak.exitCode).toBe(6);
    expect(userLeak.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');

    const { store: refreshStore } = await makeStore({
      user: 'upskii_cli_r_refresh_token_should_fail',
    });
    const refreshRes = await execCli('workspaces list --env staging --json', {
      credentialStore: refreshStore,
    });
    expect(refreshRes.exitCode).toBe(3);
    expect(refreshRes.stderr).toContain('UPSKII_REFRESH_TOKEN_NOT_ACCESS');

    // Stored user cookie pair containing a refresh token is rejected.
    const { store: cookieRefreshStore } = await makeStore({
      user: 'upskii.session_token=upskii_cli_r_stored_cookie_refresh_99',
    });
    const cookieRefresh = await execCli(
      'workspaces list --env staging --json',
      { credentialStore: cookieRefreshStore }
    );
    expect(cookieRefresh.exitCode).toBe(3);
    expect(cookieRefresh.stderr).toContain('UPSKII_REFRESH_TOKEN_NOT_ACCESS');

    // Settings preview redacts values and applied update never echoes raw server data.
    const settingsDir = await makeTempDir();
    const settingsFile = join(settingsDir, 'settings.json');
    await writeFile(
      settingsFile,
      JSON.stringify({ webhookSecret: 'very-sensitive-file-value-9911' }),
      { mode: 0o600 }
    );
    const settingsPreview = await execCli(
      [
        'settings',
        'update',
        '--file',
        settingsFile,
        '--env',
        'staging',
        '--json',
      ],
      { credentialStore: store }
    );
    expect(settingsPreview.stdout).not.toContain(
      'very-sensitive-file-value-9911'
    );
    expect(JSON.parse(settingsPreview.stdout).preview.changes).toEqual([
      { after: '[redacted]', field: 'webhookSecret' },
    ]);

    const settingsApplied = await execCli(
      [
        'settings',
        'update',
        '--file',
        settingsFile,
        '--env',
        'staging',
        '--yes',
        '--json',
      ],
      {
        credentialStore: store,
        fetch: async () =>
          jsonResp({
            echoedOpaque: 'very-sensitive-file-value-9911',
            ok: true,
          }),
      }
    );
    expect(settingsApplied.exitCode).toBeUndefined();
    expect(settingsApplied.stdout).not.toContain(
      'very-sensitive-file-value-9911'
    );
    expect(JSON.parse(settingsApplied.stdout).updatedFields).toEqual([
      'webhookSecret',
    ]);

    const missingParentSession = await execCli(
      [
        'workspaces',
        'list',
        '--env',
        'staging',
        '--session-file',
        join(settingsDir, 'nonexistent-parent', 'state.json'),
        '--json',
      ],
      { credentialStore: store }
    );
    expect(missingParentSession.exitCode).toBe(4);
    expect(missingParentSession.stderr).toContain('FILE_NOT_FOUND');

    // Failed settings update uses a fixed non-echoing message and never prints settings-file values.
    const settingsErr = await execCli(
      [
        'settings',
        'update',
        '--file',
        settingsFile,
        '--env',
        'staging',
        '--yes',
        '--json',
      ],
      {
        credentialStore: store,
        fetch: async () =>
          jsonResp(
            { error: 'rejected value very-sensitive-file-value-9911' },
            400
          ),
      }
    );
    expect(settingsErr.exitCode).toBe(1);
    expect(settingsErr.stdout).toBe('');
    expect(settingsErr.stderr).not.toContain('very-sensitive-file-value-9911');
    expect(settingsErr.stderr).toContain('Upskii settings update failed.');

    // Non-secret error on settings update still uses a fixed non-echoing message.
    const settingsFixedErr = await execCli(
      [
        'settings',
        'update',
        '--file',
        settingsFile,
        '--env',
        'staging',
        '--yes',
        '--json',
      ],
      {
        credentialStore: store,
        fetch: async () =>
          jsonResp({ error: 'upstream raw detail must not print' }, 422),
      }
    );
    expect(settingsFixedErr.exitCode).toBe(1);
    expect(settingsFixedErr.stderr).not.toContain(
      'upstream raw detail must not print'
    );
    expect(settingsFixedErr.stderr).toContain('Upskii settings update failed.');

    // Account sessions list projects safe fields and blocks secret-named keys.
    const sessionsRes = await execCli(
      'accounts sessions list --env staging --json',
      {
        credentialStore: store,
        fetch: async () =>
          jsonResp({
            sessions: [
              { current: true, id: 'sess-safe-1', opaqueField: 'drop-me' },
            ],
          }),
      }
    );
    expect(sessionsRes.stdout).not.toContain('drop-me');
    expect(JSON.parse(sessionsRes.stdout).sessions[0]).not.toHaveProperty(
      'opaqueField'
    );

    const sessionsLeak = await execCli(
      'accounts sessions list --env staging --json',
      {
        credentialStore: store,
        fetch: async () =>
          jsonResp({
            sessions: [
              { current: true, id: 's-2', sessionToken: 'opaque-secret' },
            ],
          }),
      }
    );
    expect(sessionsLeak.exitCode).toBe(6);
    expect(sessionsLeak.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');

    // SSE stream screens full buffer & truncated JSON frames BEFORE slicing preview.
    const sseLeak = await execCli(
      'tutor smoke --class cls-1 --expect-stream --env staging --yes --json',
      {
        credentialStore: store,
        fetch: async () => {
          const padding = 'a'.repeat(300);
          return new Response(
            `data: {"delta":"${padding}"}\n\ndata: {"truncated":"\\u0075pskii_cli_a_user_unicode_leak_8888`,
            {
              headers: { 'Content-Type': 'text/event-stream' },
              status: 200,
            }
          );
        },
      }
    );
    expect(sseLeak.exitCode).toBe(6);
    expect(sseLeak.stdout).toBe('');
    expect(sseLeak.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');

    // D1 telemetry header leaking another credential pattern is blocked.
    const d1Leak = await execCli('workspaces list --env staging --json', {
      credentialStore: store,
      fetch: async () =>
        new Response(JSON.stringify({ workspaces: [] }), {
          headers: {
            'Content-Type': 'application/json',
            'x-upskii-d1-debug': 'upskii_cli_a_other_token_leak_7777',
          },
          status: 200,
        }),
    });
    expect(d1Leak.exitCode).toBe(6);
    expect(d1Leak.stderr).toContain('CREDENTIAL_LEAK_BLOCKED');

    // D1 telemetry rejects non-numeric/opaque strings in metric headers and omits d1Telemetry on settings update.
    const d1Opaque = await execCli('workspaces list --env staging --json', {
      credentialStore: store,
      fetch: async () =>
        new Response(JSON.stringify({ workspaces: [] }), {
          headers: {
            'Content-Type': 'application/json',
            'x-upskii-d1-bookmark': 'opaque-secret-smuggle-value',
            'x-upskii-d1-queries': 'opaque-not-a-number',
            'x-upskii-d1-rows-read': '42',
          },
          status: 200,
        }),
    });
    expect(d1Opaque.stdout).not.toContain('opaque-secret-smuggle-value');
    expect(d1Opaque.stdout).not.toContain('opaque-not-a-number');
    expect(JSON.parse(d1Opaque.stdout).d1Telemetry).toEqual({
      'x-upskii-d1-rows-read': '42',
    });

    // Deeply nested JSON (>32 levels) fails closed instead of bypassing secret-key screening.
    let nested: Record<string, unknown> = { secret: 'deeply-nested-secret' };
    for (let i = 0; i < 36; i += 1) nested = { child: nested };
    const deepRes = await execCli('admin overview --env staging --json', {
      credentialStore: store,
      fetch: async () => jsonResp(nested),
    });
    expect(deepRes.exitCode).toBe(6);
    expect(deepRes.stdout).toBe('');
    expect(deepRes.stderr).toContain('UPSKII_RESPONSE_TOO_DEEP');

    // Admin overview projects only safe scalar metrics and drops arbitrary opaque strings.
    const safeOverview = await execCli('admin overview --env staging --json', {
      credentialStore: store,
      fetch: async () =>
        jsonResp({ activeUsers: 50, opaqueNote: 'must-not-print-opaque' }),
    });
    expect(safeOverview.stdout).not.toContain('must-not-print-opaque');
    expect(JSON.parse(safeOverview.stdout).overview).toEqual({
      activeUsers: 50,
    });

    // --session-file containing refresh token prefix is rejected.
    const refreshStateFile = join(settingsDir, 'refresh-state.json');
    await writeFile(
      refreshStateFile,
      JSON.stringify({
        cookies: [
          {
            domain: 'staging.app.upskii.com',
            httpOnly: true,
            name: 'upskii.session_token',
            path: '/',
            sameSite: 'Lax',
            secure: true,
            value: 'upskii_cli_r_never_as_cookie_123456',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 }
    );
    const refreshCookieRes = await execCli(
      [
        'workspaces',
        'list',
        '--env',
        'staging',
        '--session-file',
        refreshStateFile,
        '--json',
      ],
      { credentialStore: store }
    );
    expect(refreshCookieRes.exitCode).toBe(3);
    expect(refreshCookieRes.stderr).toContain(
      'UPSKII_REFRESH_TOKEN_NOT_ACCESS'
    );
  });
});
