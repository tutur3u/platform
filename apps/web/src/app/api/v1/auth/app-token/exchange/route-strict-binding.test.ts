// @vitest-environment jsdom
import './route-test-support';
import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
  victimUserId,
  workspaceId,
} from './route-test-support';

const beforeExpiry = new Date('2026-11-24T12:00:00+07:00');
const atExpiry = new Date('2026-11-25T23:59:00+07:00');
const driveScopes = ['workspace:drive:read', 'workspace:drive:write'];

function exchange(appId: string, body: Record<string, unknown>) {
  return POST(
    createExchangeRequest({
      appId,
      appSecret: 'ttr_app_secret_test',
      requestedScopes: ['workspace:drive:read'],
      ...body,
    })
  );
}

function unboundRefreshToken(targetApp: string) {
  return createAppCoordinationToken(
    {
      email: 'victim@example.com',
      expiresInSeconds: 86_400,
      originApp: 'web',
      scopes: ['app-token:refresh'],
      targetApp,
      userId: victimUserId,
    },
    { secret: 'test-secret' }
  ).token;
}

async function accessWorkspace(response: Response) {
  const body = (await response.json()) as { accessToken: string };
  const verification = verifyAppCoordinationToken(body.accessToken, {
    secret: 'test-secret',
  });
  return verification.ok ? (verification.claims.workspace_id ?? null) : 'bad';
}

describe('app token exchange strict binding (RA-MEDIA-C1-001)', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('exempts cybershield35 from the missing-workspace refusals before expiry', async () => {
    vi.setSystemTime(beforeExpiry);
    mockRegisteredApp(driveScopes, 'cybershield35', [workspaceId]);

    const fresh = await exchange('cybershield35', {
      token: 'valid-cross-app-token',
    });
    expect(fresh.status).toBe(200);
    expect(await accessWorkspace(fresh)).toBeNull();

    const refreshed = await exchange('cybershield35', {
      refreshToken: unboundRefreshToken('cybershield35'),
    });
    expect(refreshed.status).toBe(200);
  });

  it('still binds cybershield35 when it names a workspace', async () => {
    vi.setSystemTime(beforeExpiry);
    mockRegisteredApp(driveScopes, 'cybershield35', [workspaceId]);

    const response = await exchange('cybershield35', {
      token: 'valid-cross-app-token',
      workspaceId,
    });
    expect(response.status).toBe(200);
    expect(await accessWorkspace(response)).toBe(workspaceId);
  });

  it('applies strict binding to cybershield35 at the expiry', async () => {
    vi.setSystemTime(atExpiry);
    mockRegisteredApp(driveScopes, 'cybershield35', [workspaceId]);

    const fresh = await exchange('cybershield35', {
      token: 'valid-cross-app-token',
    });
    expect(fresh.status).toBe(400);
    const refreshed = await exchange('cybershield35', {
      refreshToken: unboundRefreshToken('cybershield35'),
    });
    expect(refreshed.status).toBe(400);
  });

  it('logs the app id and outcome of a refusal without tokens or workspace ids', async () => {
    vi.setSystemTime(atExpiry);
    mockRegisteredApp(driveScopes, 'cybershield35', [workspaceId]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await exchange('cybershield35', { token: 'valid-cross-app-token' });
    const refreshToken = unboundRefreshToken('cybershield35');
    await exchange('cybershield35', { refreshToken });

    const lines = warn.mock.calls.filter(
      ([prefix]) => prefix === '[app-token-exchange]'
    );
    warn.mockRestore();
    expect(lines.map(([, fields]) => fields)).toEqual([
      {
        appId: 'cybershield35',
        outcome: 'workspace-id-required',
        refresh: false,
        status: 400,
        verified: true,
      },
      {
        appId: 'cybershield35',
        outcome: 'workspace-id-required',
        refresh: true,
        status: 400,
        verified: true,
      },
    ]);
    const logged = JSON.stringify(lines);
    for (const secret of [
      'valid-cross-app-token',
      refreshToken,
      workspaceId,
      victimUserId,
      'victim@example.com',
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('logs a refused external-projects refresh as strict-binding-refused', async () => {
    vi.setSystemTime(beforeExpiry);
    mockRegisteredApp(
      ['external-projects:read', ...driveScopes],
      'cybershield35',
      [workspaceId]
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await exchange('cybershield35', {
      refreshToken: unboundRefreshToken('cybershield35'),
      requestedScopes: ['external-projects:read'],
      workspaceId,
    });

    const lines = warn.mock.calls.filter(
      ([prefix]) => prefix === '[app-token-exchange]'
    );
    warn.mockRestore();
    expect(response.status).toBe(401);
    expect(lines).toEqual([
      [
        '[app-token-exchange]',
        {
          appId: 'cybershield35',
          outcome: 'strict-binding-refused',
          refresh: true,
          status: 401,
          verified: true,
        },
      ],
    ]);
    expect(JSON.stringify(lines)).not.toContain(workspaceId);
  });

  it('logs a failed app secret as unverified', async () => {
    vi.setSystemTime(beforeExpiry);
    mocks.verifyExternalAppSecret.mockResolvedValueOnce({
      error: 'Invalid app secret',
      ok: false,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await exchange('cybershield35', {
      token: 'valid-cross-app-token',
    });

    const lines = warn.mock.calls.filter(
      ([prefix]) => prefix === '[app-token-exchange]'
    );
    warn.mockRestore();
    expect(response.status).toBe(401);
    expect(lines).toEqual([
      [
        '[app-token-exchange]',
        {
          appId: 'cybershield35',
          outcome: 'unauthorized',
          refresh: false,
          status: 401,
          verified: false,
        },
      ],
    ]);
  });

  it('applies strict binding to every other app before the expiry', async () => {
    vi.setSystemTime(beforeExpiry);
    mockRegisteredApp(driveScopes, 'drive-app', [workspaceId]);

    expect(
      (await exchange('drive-app', { token: 'valid-cross-app-token' })).status
    ).toBe(400);
  });

  it('ends the exemption early when the env flag forces it', async () => {
    vi.setSystemTime(beforeExpiry);
    vi.stubEnv('EXTERNAL_APP_STRICT_BINDING', 'all');
    mockRegisteredApp(driveScopes, 'cybershield35', [workspaceId]);

    expect(
      (await exchange('cybershield35', { token: 'valid-cross-app-token' }))
        .status
    ).toBe(400);
  });

  it.each([['external-projects:read'], ['external-projects:publish']])(
    'never binds an exempt app refresh token for %s',
    async (scope) => {
      vi.setSystemTime(beforeExpiry);
      mockRegisteredApp([scope, ...driveScopes], 'cybershield35', [
        workspaceId,
      ]);

      for (const workspace of [undefined, workspaceId]) {
        const response = await exchange('cybershield35', {
          refreshToken: unboundRefreshToken('cybershield35'),
          requestedScopes: [scope],
          workspaceId: workspace,
        });
        expect(response.status).toBe(401);
      }
    }
  );
});

describe('exempt app bind on refresh (RA-MEDIA-C1-001)', () => {
  registerExchangeTestSetup();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(beforeExpiry);
    mockRegisteredApp(
      [...driveScopes, 'external-projects:*'],
      'cybershield35',
      [workspaceId]
    );
  });

  async function bindOnRefresh(refreshToken: string) {
    return exchange('cybershield35', { refreshToken, workspaceId });
  }

  it('marks a refresh token bound on refresh and refuses it external projects', async () => {
    const response = await bindOnRefresh(unboundRefreshToken('cybershield35'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { refreshToken: string };
    const rotated = verifyAppCoordinationToken(body.refreshToken, {
      secret: 'test-secret',
    });
    expect(rotated.ok && rotated.claims.workspace_id).toBe(workspaceId);
    expect(rotated.ok && rotated.claims.scopes).toContain(
      'app-token:bound-on-refresh'
    );

    const projects = await exchange('cybershield35', {
      refreshToken: body.refreshToken,
      requestedScopes: ['external-projects:*'],
    });
    expect(projects.status).toBe(401);
  });

  // Last: the replay fence keeps in-process state for the rest of the file.
  it('cannot bind the same unbound token twice inside the replay grace', async () => {
    const token = unboundRefreshToken('cybershield35');
    expect((await bindOnRefresh(token)).status).toBe(200);

    // The retry loses SET NX and reads a first use inside the grace window.
    mocks.redisSet.mockResolvedValueOnce(null);
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.startsWith('app-token:refresh:family-revoked:')
        ? null
        : Math.floor(Date.now() / 1000)
    );
    expect((await bindOnRefresh(token)).status).toBe(401);
  });
});
