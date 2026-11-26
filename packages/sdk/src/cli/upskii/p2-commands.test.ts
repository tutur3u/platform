import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialStore } from '../credential-store';
import { type RunUpskiiCommandDeps, runUpskiiCommand } from './index';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-p2-test-'));
  tempDirs.push(dir);
  return dir;
}

async function makeStore(secrets: {
  admin?: string;
  env?: 'prod' | 'staging';
  user?: string;
}) {
  const homeDir = await makeTempDir();
  const store = createCredentialStore({ env: {}, homeDir, platform: 'linux' });
  const env = secrets.env ?? 'staging';
  if (secrets.user) {
    await store.set({
      backend: 'file',
      env,
      family: 'upskii-user',
      profile: 'default',
      scopes: ['upskii:profile:read', 'upskii:settings:write'],
      secret: secrets.user,
    });
  }
  if (secrets.admin) {
    await store.set({
      backend: 'file',
      env,
      family: 'upskii-admin',
      profile: 'default',
      scopes: ['upskii:admin:read', 'upskii:admin:write'],
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

async function execCli(
  cmd: string | string[],
  deps: RunUpskiiCommandDeps
): Promise<{ exitCode: number | undefined; stderr: string; stdout: string }> {
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

describe('ttr external upskii P2 subfamilies', () => {
  it('runs read-only GETs across workspaces and settings with P2 Bearer token and zero Cookie mixing', async () => {
    const userToken = 'upskii_cli_a_user_workspace_secret_0001';
    const { store } = await makeStore({ user: userToken });
    const seen: Array<{
      auth: string | null;
      cookie: string | null;
      method: string;
      url: string;
    }> = [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const headers = new Headers(init?.headers);
      seen.push({
        auth: headers.get('authorization'),
        cookie: headers.get('cookie'),
        method: init?.method ?? 'GET',
        url,
      });
      if (url.endsWith('/account-workspaces')) {
        return jsonResp({ workspaces: [{ id: 'ws-1', name: 'Main' }] });
      }
      if (url.endsWith('/account-workspaces/ws-1')) {
        return jsonResp({ id: 'ws-1', name: 'Main' });
      }
      if (url.endsWith('/account-workspaces/ws-1/members')) {
        return jsonResp({
          members: [{ email: 'u@example.com', id: 'm-1', role: 'owner' }],
        });
      }
      if (url.endsWith('/admin/display-preferences')) {
        return jsonResp({ theme: 'dark' });
      }
      if (url.endsWith('/settings/membership')) {
        return jsonResp({ locale: 'en', scope: 'workspace' });
      }
      return jsonResp({ locale: 'en' });
    };

    const deps = { credentialStore: store, fetch: mockFetch };
    const wsList = await execCli('workspaces list --env staging --json', deps);
    const wsGet = await execCli(
      'workspaces get ws-1 --env staging --json',
      deps
    );
    const wsMem = await execCli(
      'workspaces members ws-1 --env staging --json',
      deps
    );
    const settings = await execCli('settings get --env staging --json', deps);
    const prefs = await execCli(
      'settings preferences --env staging --json',
      deps
    );

    expect(JSON.parse(wsList.stdout).count).toBe(1);
    expect(JSON.parse(wsGet.stdout).id).toBe('ws-1');
    expect(JSON.parse(wsMem.stdout).count).toBe(1);
    expect(JSON.parse(settings.stdout).settings.locale).toBe('en');
    expect(JSON.parse(prefs.stdout).preferences.theme).toBe('dark');
    expect(wsList.stdout).not.toContain(userToken);
    expect(seen).toHaveLength(5);
    expect(seen.every((r) => r.method === 'GET')).toBe(true);
    expect(seen.every((r) => r.url.includes('/api/upskii/'))).toBe(true);
    expect(seen.every((r) => !r.url.includes('/workspace/educator/'))).toBe(
      true
    );
    expect(seen.every((r) => r.auth === `Bearer ${userToken}`)).toBe(true);
    expect(seen.every((r) => r.cookie === null)).toBe(true);
  });

  it('previews mutations by default, enforces --dry-run over --yes, and requires --reason on prod settings update', async () => {
    const userToken = 'upskii_cli_a_user_mutation_secret_0002';
    const { store } = await makeStore({ env: 'staging', user: userToken });
    const calls: Array<{
      body?: unknown;
      method: string;
      origin: string | null;
      url: string;
    }> = [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        method: init?.method ?? 'GET',
        origin: new Headers(init?.headers).get('origin'),
        url: typeof input === 'string' ? input : input.toString(),
      });
      return jsonResp({ ok: true });
    };
    const deps = { credentialStore: store, fetch: mockFetch };

    const preview = await execCli(
      'workspaces switch ws-9 --env staging --json',
      deps
    );
    expect(JSON.parse(preview.stdout).applied).toBe(false);
    expect(calls).toHaveLength(0);

    const dryRun = await execCli(
      'settings update --section display --key hideVersionBadge --value true --env staging --yes --dry-run --json',
      deps
    );
    expect(JSON.parse(dryRun.stdout).applied).toBe(false);
    expect(calls).toHaveLength(0);

    const unsupportedDisplay = await execCli(
      'settings update --section display --key compact --value true --env staging --yes --json',
      deps
    );
    expect(unsupportedDisplay.exitCode).toBe(1);
    expect(unsupportedDisplay.stderr).toContain('INVALID_DISPLAY_PREFERENCE');
    expect(calls).toHaveLength(0);

    const applied = await execCli(
      'settings update --section display --key hideVersionBadge --value true --env staging --yes --json',
      deps
    );
    expect(JSON.parse(applied.stdout).applied).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.origin).toBe('https://staging.app.upskii.com');
    expect(calls[0]?.url).toContain('/api/upskii/admin/display-preferences');
    expect(calls[0]?.body).toEqual({ hideVersionBadge: true });

    const prodNoReason = await execCli(
      'settings update --key locale --value vi --env prod --yes --json',
      deps
    );
    expect(prodNoReason.exitCode).toBe(6);
    expect(prodNoReason.stderr).toContain('REASON_REQUIRED');
    expect(calls).toHaveLength(1);
  });

  it('covers assessments and tutor read-only GETs, previews, JSON/stream smokes, and gated writes', async () => {
    const userToken = 'upskii_cli_a_assess_tutor_secret_0003';
    const { store } = await makeStore({ user: userToken });
    const calls: Array<{ method: string; url: string }> = [];

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ method: init?.method ?? 'GET', url });
      if (url.includes('/assessments?classId=cls-1')) {
        return jsonResp({ assessments: [{ id: 'a-1', title: 'Quiz 1' }] });
      }
      if (url.endsWith('/assessments/a-1/submissions')) {
        return jsonResp({ submissions: [{ id: 'sub-1', score: 95 }] });
      }
      if (url.endsWith('/assessments/a-1')) return jsonResp({ id: 'a-1' });
      if (url.endsWith('/assessments') && init?.method === 'POST') {
        return jsonResp({ id: 'a-2', title: 'Lab 1' });
      }
      if (url.endsWith('/assessments/a-2/publish')) {
        return jsonResp({ published: true });
      }
      if (url.includes('/tutor/sessions?classId=cls-1')) {
        return jsonResp({ sessions: [{ classId: 'cls-1', id: 'ts-1' }] });
      }
      if (url.endsWith('/tutor/sessions/ts-1')) return jsonResp({ id: 'ts-1' });
      if (url.endsWith('/prompt-library')) {
        return jsonResp({ prompts: [{ id: 'p-1', title: 'Step by step' }] });
      }
      if (url.endsWith('/tutor/smoke')) {
        const headers = new Headers(init?.headers);
        if (headers.get('x-upskii-ai-chat-stream') === '1') {
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(enc.encode('data: {"delta":"Tutor ok"}\n\n'));
              c.close();
            },
          });
          return new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
            status: 200,
          });
        }
        return jsonResp({ reply: 'Tutor responsive.' });
      }
      return jsonResp({});
    };
    const deps = { credentialStore: store, fetch: mockFetch };

    expect(
      JSON.parse(
        (
          await execCli(
            'assessments list --class cls-1 --env staging --json',
            deps
          )
        ).stdout
      ).count
    ).toBe(1);
    expect(
      JSON.parse(
        (await execCli('assessments get a-1 --env staging --json', deps)).stdout
      ).id
    ).toBe('a-1');
    expect(
      JSON.parse(
        (
          await execCli(
            'assessments submissions a-1 --env staging --json',
            deps
          )
        ).stdout
      ).count
    ).toBe(1);

    const createPreview = await execCli(
      'assessments create --class cls-1 --title Lab1 --type assignment --env staging --json',
      deps
    );
    expect(JSON.parse(createPreview.stdout).applied).toBe(false);
    const createApply = await execCli(
      'assessments create --class cls-1 --title Lab1 --type assignment --env staging --yes --json',
      deps
    );
    expect(JSON.parse(createApply.stdout).applied).toBe(true);
    const pubApply = await execCli(
      'assessments publish a-2 --env staging --yes --json',
      deps
    );
    expect(JSON.parse(pubApply.stdout).applied).toBe(true);

    expect(
      JSON.parse(
        (
          await execCli(
            'tutor sessions list --class cls-1 --env staging --json',
            deps
          )
        ).stdout
      ).count
    ).toBe(1);
    expect(
      JSON.parse(
        (await execCli('tutor get ts-1 --env staging --json', deps)).stdout
      ).id
    ).toBe('ts-1');
    expect(
      JSON.parse(
        (await execCli('tutor prompts list --env staging --json', deps)).stdout
      ).count
    ).toBe(1);

    const beforeSmoke = calls.length;
    const smokePreview = await execCli(
      'tutor smoke --class cls-1 --env staging --json',
      deps
    );
    expect(JSON.parse(smokePreview.stdout).applied).toBe(false);
    expect(calls).toHaveLength(beforeSmoke);

    const smokeJson = await execCli(
      'tutor smoke --class cls-1 --prompt Ping --env staging --yes --json',
      deps
    );
    expect(JSON.parse(smokeJson.stdout).ok).toBe(true);

    const smokeStream = await execCli(
      'tutor smoke --class cls-1 --expect-stream --env staging --yes --json',
      deps
    );
    expect(JSON.parse(smokeStream.stdout).chunks).toBeGreaterThan(0);
  });

  it('enforces Tier 2 --confirm on accounts revoke-session and admin flags set, plus admin auth & prod guards', async () => {
    const userToken = 'upskii_cli_a_accounts_user_secret_0004';
    const adminToken = 'upskii_cli_a_admin_ops_secret_0005';
    const { homeDir, store } = await makeStore({
      admin: adminToken,
      env: 'staging',
      user: userToken,
    });
    const stateFile = join(homeDir, 'user-state.json');
    await writeFile(
      stateFile,
      JSON.stringify({
        cookies: [
          {
            domain: 'staging.app.upskii.com',
            httpOnly: true,
            name: 'upskii.session_token',
            path: '/',
            sameSite: 'Lax',
            secure: true,
            value: 'user-cookie-must-never-reach-admin',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 }
    );

    const calls: Array<{ auth: string | null; method: string; url: string }> =
      [];
    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({
        auth: new Headers(init?.headers).get('authorization'),
        method: init?.method ?? 'GET',
        url,
      });
      if (url.includes('/api/auth/get-session')) {
        return jsonResp({
          session: {
            id: 'sess-42',
            token: 'raw-better-auth-token-must-be-stripped',
            userId: 'u-1',
          },
          user: { email: 'teacher@tuturuuu.com', id: 'u-1', name: 'Teacher' },
        });
      }
      if (url.endsWith('/api/auth/list-sessions')) {
        return jsonResp([
          {
            id: 'sess-42',
            token: 'raw-better-auth-list-token-must-be-stripped',
          },
          {
            id: 'sess-99',
            token: 'raw-other-session-token-must-be-stripped',
          },
        ]);
      }
      if (url.includes('/api/upskii/usage/analytics'))
        return jsonResp({ totalRequests: 12 });
      if (url.endsWith('/account/sessions/sess-42')) {
        return jsonResp({ revoked: true });
      }
      if (url.endsWith('/api/admin/snapshot')) {
        return jsonResp({ activeUsers: 50 });
      }
      if (url.includes('/api/admin/users?query=alice')) {
        return jsonResp({ users: [{ id: 'u-alice' }] });
      }
      if (url.endsWith('/api/admin/users/u-alice')) {
        return jsonResp({ id: 'u-alice' });
      }
      if (url.endsWith('/api/admin/experimental-features')) {
        return jsonResp({ flags: [{ enabled: false, key: 'ai_tutor_v2' }] });
      }
      if (url.endsWith('/api/admin/experimental-features/ai_tutor_v2')) {
        return jsonResp({ key: 'ai_tutor_v2', value: true });
      }
      return jsonResp({});
    };
    const deps = { credentialStore: store, fetch: mockFetch };

    expect(
      JSON.parse(
        (await execCli('accounts profile --env staging --json', deps)).stdout
      ).profile.id
    ).toBe('u-1');
    const sessionsOut = JSON.parse(
      (await execCli('accounts sessions list --env staging --json', deps))
        .stdout
    ) as { count: number; sessions: Array<{ current: boolean; id: string }> };
    expect(sessionsOut.count).toBe(2);
    expect(sessionsOut.sessions).toEqual([
      expect.objectContaining({ current: true, id: 'sess-42' }),
      expect.objectContaining({ current: false, id: 'sess-99' }),
    ]);
    expect(
      JSON.parse(
        (await execCli('accounts usage --days 7 --env staging --json', deps))
          .stdout
      ).usage.totalRequests
    ).toBe(12);

    const revokeNoConfirm = await execCli(
      'accounts revoke-session sess-42 --env staging --yes --json',
      deps
    );
    expect(revokeNoConfirm.exitCode).toBe(6);
    expect(revokeNoConfirm.stderr).toContain('CONFIRMATION_REQUIRED');

    const revokeOk = await execCli(
      'accounts revoke-session sess-42 --env staging --yes --confirm sess-42 --json',
      deps
    );
    expect(JSON.parse(revokeOk.stdout).revoked).toBe(true);

    // Admin refuses inferred prod without explicit --env prod
    const inferredProd = await execCli('admin overview --json', {
      credentialStore: store,
      envVars: { TTR_ENV: 'prod' },
      fetch: mockFetch,
    });
    expect(inferredProd.exitCode).toBe(6);
    expect(inferredProd.stderr).toContain('PROD_ENV_EXPLICIT_REQUIRED');

    // Admin refuses --session-file user cookie
    const cookieAdmin = await execCli(
      [
        'admin',
        'overview',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--json',
      ],
      deps
    );
    expect(cookieAdmin.exitCode).toBe(6);
    expect(cookieAdmin.stderr).toContain(
      'UPSKII_ADMIN_SESSION_FILE_UNSUPPORTED'
    );

    // Admin NEVER falls back to upskii-user credential
    const { store: userOnlyStore } = await makeStore({ user: userToken });
    const noAdmin = await execCli('admin overview --env staging --json', {
      credentialStore: userOnlyStore,
      fetch: mockFetch,
    });
    expect(noAdmin.exitCode).toBe(3);
    expect(noAdmin.stderr).toContain('UPSKII_ADMIN_AUTH_REQUIRED');

    // Admin reads & Tier 2 flags set
    expect(
      JSON.parse(
        (await execCli('admin overview --env staging --json', deps)).stdout
      ).origin
    ).toBe('https://staging.admin.upskii.com');
    expect(
      JSON.parse(
        (
          await execCli(
            'admin users list --query alice --env staging --json',
            deps
          )
        ).stdout
      ).count
    ).toBe(1);
    expect(
      JSON.parse(
        (await execCli('admin users get u-alice --env staging --json', deps))
          .stdout
      ).id
    ).toBe('u-alice');
    expect(
      JSON.parse(
        (await execCli('admin flags list --env staging --json', deps)).stdout
      ).count
    ).toBe(1);

    const flagNoConfirm = await execCli(
      'admin flags set ai_tutor_v2 --value true --env staging --yes --json',
      deps
    );
    expect(flagNoConfirm.exitCode).toBe(6);
    expect(flagNoConfirm.stderr).toContain('CONFIRMATION_REQUIRED');

    const flagSet = await execCli(
      'admin flags set ai_tutor_v2 --value true --env staging --yes --confirm ai_tutor_v2 --json',
      deps
    );
    expect(JSON.parse(flagSet.stdout).applied).toBe(true);
    const adminCalls = calls.filter(
      (c) => new URL(c.url).origin === 'https://staging.admin.upskii.com'
    );
    expect(adminCalls.length).toBeGreaterThanOrEqual(5);
    expect(adminCalls.every((c) => c.auth === `Bearer ${adminToken}`)).toBe(
      true
    );
  });
});
