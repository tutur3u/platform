import { randomUUID } from 'node:crypto';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getUpstashRestRedisClient,
  hasUpstashRestEnv,
} from '@tuturuuu/utils/upstash-rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(async () => ({
    get: mocks.get,
    set: mocks.set,
  })),
  hasUpstashRestEnv: vi.fn(() => true),
}));

import { verifyExternalAppRefreshToken } from './external-app-refresh';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const familyTtlSeconds = 2_592_000;
const liveApp = {
  allowedWorkspaceIds: [workspaceId],
  enabled: true,
  id: 'fysh',
  secretIssuedAt: null as string | null,
};

type QueryResult = { data: unknown; error: { message: string } | null };

/** An admin client answering each table with one result and logging reads. */
function adminWith(results: Record<string, QueryResult> = {}) {
  const queries: string[] = [];
  const admin = {
    from: (table: string) => {
      queries.push(table);
      const result = results[table] ?? { data: null, error: null };
      const builder = {
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => result,
        select: () => builder,
        then: (
          resolve: (value: QueryResult) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as TypedSupabaseClient;
  return { admin, queries };
}

const member = {
  workspace_members: { data: { type: 'MEMBER' }, error: null },
};

function refreshToken({
  workspace = workspaceId,
}: { workspace?: string | null } = {}) {
  return createAppCoordinationToken(
    {
      expiresInSeconds: 86_400,
      scopes: ['app-token:refresh', `app-token:family:${randomUUID()}`],
      targetApp: 'fysh',
      userId: randomUUID(),
      ...(workspace ? { workspaceId: workspace } : {}),
    },
    { secret: 'test-secret' }
  ).token;
}

function refresh(
  token: string,
  admin: TypedSupabaseClient,
  app: typeof liveApp = liveApp,
  replayGraceSeconds = 30
) {
  return verifyExternalAppRefreshToken({
    admin,
    app,
    familyTtlSeconds,
    ip: '203.0.113.7',
    refreshToken: token,
    replayGraceSeconds,
    targetApp: 'fysh',
  });
}

function expectFamilyRevoked() {
  expect(mocks.set).toHaveBeenCalledWith(
    expect.stringMatching(/^app-token:refresh:family-revoked:fysh:/u),
    expect.any(String),
    { ex: familyTtlSeconds }
  );
}

function expectFamilyKept() {
  expect(mocks.set).not.toHaveBeenCalledWith(
    expect.stringMatching(/^app-token:refresh:family-revoked:/u),
    expect.anything(),
    expect.anything()
  );
}

describe('external app refresh grant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue('OK');
    vi.mocked(hasUpstashRestEnv).mockReturnValue(true);
    vi.mocked(getUpstashRestRedisClient).mockImplementation(
      async () => ({ get: mocks.get, set: mocks.set }) as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('refreshes a live grant with one membership read', async () => {
    const { admin, queries } = adminWith(member);

    expect(await refresh(refreshToken(), admin)).toMatchObject({
      claims: { workspace_id: workspaceId },
    });
    expect(queries).toEqual(['workspace_members']);
    expectFamilyKept();
  });

  it('reads nothing for a token without a workspace', async () => {
    const { admin, queries } = adminWith();

    expect(await refresh(refreshToken({ workspace: null }), admin)).toEqual(
      expect.objectContaining({ family: expect.any(String) })
    );
    expect(queries).toEqual([]);
  });

  it('accepts a workspace linked through its external project binding', async () => {
    const { admin, queries } = adminWith({
      ...member,
      canonical_external_projects: {
        data: { adapter: 'fysh', id: 'fysh-main', is_active: true },
        error: null,
      },
      workspace_external_project_bindings: {
        data: {
          canonical_project_id: 'fysh-main',
          is_enabled: true,
          settings: null,
        },
        error: null,
      },
    });

    expect(
      await refresh(refreshToken(), admin, {
        ...liveApp,
        allowedWorkspaceIds: [],
      })
    ).not.toBeNull();
    expect(queries).toEqual([
      'workspace_members',
      'workspace_external_project_bindings',
      'canonical_external_projects',
    ]);
  });

  it.each([
    ['a disabled app', { ...liveApp, enabled: false }],
    [
      'a secret rotated after the token was issued',
      {
        ...liveApp,
        secretIssuedAt: new Date(Date.now() + 5_000).toISOString(),
      },
    ],
  ])('refuses %s and revokes the family', async (_label, app) => {
    const { admin, queries } = adminWith(member);

    expect(await refresh(refreshToken(), admin, app)).toBeNull();
    expect(queries).toEqual([]);
    expectFamilyRevoked();
  });

  it('keeps a token issued after the current secret', async () => {
    const { admin } = adminWith(member);
    const rotatedAt = new Date(Date.now() - 60_000);

    expect(
      await refresh(refreshToken(), admin, {
        ...liveApp,
        secretIssuedAt: rotatedAt.toISOString(),
      })
    ).not.toBeNull();
  });

  it.each([
    ['a removed member', { workspace_members: { data: null, error: null } }],
    [
      'a member demoted to guest',
      { workspace_members: { data: { type: 'GUEST' }, error: null } },
    ],
  ])('refuses %s and revokes the family', async (_label, results) => {
    const { admin, queries } = adminWith(results);

    expect(await refresh(refreshToken(), admin)).toBeNull();
    expect(queries).toEqual(['workspace_members']);
    expectFamilyRevoked();
  });

  it('refuses a workspace unlinked from the app and revokes the family', async () => {
    const { admin } = adminWith(member);

    expect(
      await refresh(refreshToken(), admin, {
        ...liveApp,
        allowedWorkspaceIds: [],
      })
    ).toBeNull();
    expectFamilyRevoked();
  });

  const dbDown = { data: null, error: { message: 'db down' } };
  const enabledBinding = {
    data: { canonical_project_id: 'fysh-main', is_enabled: true },
    error: null,
  };

  // Each lookup the grant re-check makes, failing in turn. An outage is never
  // a determination, so none of these may revoke the family.
  it.each<[string, Record<string, QueryResult>, string[]]>([
    [
      'the membership read',
      { workspace_members: dbDown },
      ['workspace_members'],
    ],
    [
      'the external project binding read',
      { ...member, workspace_external_project_bindings: dbDown },
      ['workspace_members', 'workspace_external_project_bindings'],
    ],
    [
      'the legacy binding secrets read',
      { ...member, workspace_secrets: dbDown },
      [
        'workspace_members',
        'workspace_external_project_bindings',
        'workspace_secrets',
      ],
    ],
    [
      'the canonical project read',
      {
        ...member,
        canonical_external_projects: dbDown,
        workspace_external_project_bindings: enabledBinding,
      },
      [
        'workspace_members',
        'workspace_external_project_bindings',
        'canonical_external_projects',
      ],
    ],
  ])(
    'answers unavailable without revoking when %s fails',
    async (_label, results, expectedQueries) => {
      const { admin, queries } = adminWith(results);

      expect(
        await refresh(refreshToken(), admin, {
          ...liveApp,
          allowedWorkspaceIds: [],
        })
      ).toBe('unavailable');
      expect(queries).toEqual(expectedQueries);
      expectFamilyKept();
    }
  );

  it('refuses an inactive canonical project and revokes the family', async () => {
    const { admin } = adminWith({
      ...member,
      canonical_external_projects: {
        data: { adapter: 'fysh', id: 'fysh-main', is_active: false },
        error: null,
      },
      workspace_external_project_bindings: enabledBinding,
    });

    expect(
      await refresh(refreshToken(), admin, {
        ...liveApp,
        allowedWorkspaceIds: [],
      })
    ).toBeNull();
    expectFamilyRevoked();
  });

  // The 503 carries `Retry-After: 30`; the grace can be configured down to 0.
  it.each([30, 0])(
    'judges a retry after a grant 503 as a first use (grace %is)',
    async (graceSeconds) => {
      const store = new Map<string, string>();
      mocks.get.mockImplementation(
        async (key: string) => store.get(key) ?? null
      );
      mocks.set.mockImplementation(
        async (key: string, value: unknown, options?: { nx?: boolean }) => {
          if (options?.nx && store.has(key)) return null;
          store.set(key, String(value));
          return 'OK';
        }
      );
      const token = refreshToken();

      expect(
        await refresh(
          token,
          adminWith({ workspace_members: dbDown }).admin,
          liveApp,
          graceSeconds
        )
      ).toBe('unavailable');
      expect(store.size).toBe(0);

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 31_000);
      expect(
        await refresh(token, adminWith(member).admin, liveApp, graceSeconds)
      ).toMatchObject({ family: expect.any(String) });
      expectFamilyKept();
    }
  );

  it('answers unavailable without revoking for an unreadable rotation time', async () => {
    const { admin, queries } = adminWith(member);

    expect(
      await refresh(refreshToken(), admin, {
        ...liveApp,
        secretIssuedAt: 'not-a-timestamp',
      })
    ).toBe('unavailable');
    expect(queries).toEqual([]);
    // Nothing is recorded, so a retry after the fix is a first use.
    expect(mocks.set).not.toHaveBeenCalled();
  });

  // The grant runs before the first use is recorded, but a replay proven
  // from that record never reaches it: replays read no Postgres, and first
  // uses and grace retries pay at most four reads under the family pre-limit.
  it('refuses a replayed token before reading Postgres', async () => {
    const { admin, queries } = adminWith(member);
    mocks.get.mockImplementation(async (key: string) =>
      key.startsWith('app-token:refresh:family-revoked:')
        ? null
        : Math.floor(Date.now() / 1000) - 3600
    );

    expect(await refresh(refreshToken(), admin)).toBeNull();
    expect(queries).toEqual([]);
  });

  it.each([
    ['production with a configured store', 'production', true],
    ['production without a configured store', 'production', false],
    ['a non-production runtime with a configured store', 'preview', true],
  ])(
    'answers unavailable for %s when the store is down',
    async (_label, deployEnv, storeConfigured) => {
      vi.stubEnv('VERCEL_ENV', deployEnv);
      vi.mocked(hasUpstashRestEnv).mockReturnValue(storeConfigured);
      vi.mocked(getUpstashRestRedisClient).mockResolvedValueOnce(null);
      const { admin, queries } = adminWith(member);

      expect(await refresh(refreshToken(), admin)).toBe('unavailable');
      expect(queries).toEqual([]);
    }
  );

  it('refreshes outside production when no replay store is configured', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.mocked(hasUpstashRestEnv).mockReturnValue(false);
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue(null);
    const { admin } = adminWith(member);

    expect(await refresh(refreshToken(), admin)).not.toBeNull();
    // The grant check still runs and still refuses a removed member.
    expect(await refresh(refreshToken(), adminWith().admin)).toBeNull();
  });
});
