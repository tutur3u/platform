import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signHiveRealtimeToken,
  verifyHiveRealtimeToken,
} from './_realtime-token';
import { hiveEventSchema, requireHiveAccess } from './_shared';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getHiveMemberByUserId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  getHiveMemberByUserId: (...args: unknown[]) =>
    mocks.getHiveMemberByUserId(...args),
}));

function createAccessClient({
  member = null,
  memberError = null,
  role = null,
  roleError = null,
}: {
  member?: { enabled: boolean } | null;
  memberError?: { message: string } | null;
  role?: { allow_role_management: boolean; enabled: boolean } | null;
  roleError?: { message: string } | null;
} = {}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi
            .fn()
            .mockResolvedValue(
              table === 'hive_members'
                ? { data: member, error: memberError }
                : { data: role, error: roleError }
            ),
        })),
      })),
    })),
  };
}

describe('Hive realtime token signing', () => {
  afterEach(() => {
    delete process.env.HIVE_REALTIME_TOKEN_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it('uses the platform Supabase service secret when the Hive secret is not set', () => {
    process.env.SUPABASE_SECRET_KEY = 'supabase-service-secret';

    const token = signHiveRealtimeToken({
      exp: 2_000_000_000,
      role: 'member',
      scopes: ['presence'],
      serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
      userId: '00000000-0000-4000-8000-000000000001',
    });

    expect(verifyHiveRealtimeToken(token)).toMatchObject({
      serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
      userId: '00000000-0000-4000-8000-000000000001',
    });
  });
});

describe('Hive API request auth', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.createAdminClient.mockReset();
    mocks.createClient.mockReset();
    mocks.getHiveMemberByUserId.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts Hive app-session cookies without reading Supabase Auth user sessions', async () => {
    const adminClient = createAccessClient({ member: { enabled: true } });
    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'hive',
      userId: '00000000-0000-4000-8000-000000000001',
    });
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getHiveMemberByUserId.mockRejectedValue(
      new Error('HIVE_DATABASE_URL is required for Hive product data')
    );

    const result = await requireHiveAccess(
      new NextRequest('https://tuturuuu.com/api/v1/hive/servers', {
        headers: {
          cookie: `tuturuuu_app_session=${token}`,
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access.user).toEqual({
        email: 'agent@example.com',
        id: '00000000-0000-4000-8000-000000000001',
      });
      expect(result.access.isMember).toBe(true);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.getHiveMemberByUserId).not.toHaveBeenCalled();
  });

  it('rejects non-Hive app-session cookies instead of accepting them as Hive users', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: '00000000-0000-4000-8000-000000000002',
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const result = await requireHiveAccess(
      new NextRequest('https://tuturuuu.com/api/v1/hive/servers', {
        headers: {
          cookie: `tuturuuu_app_session=${token}`,
        },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getHiveMemberByUserId).not.toHaveBeenCalled();
  });

  it('keeps central web Supabase sessions as a fallback for direct web requests', async () => {
    const adminClient = createAccessClient({
      role: {
        allow_role_management: true,
        enabled: true,
      },
    });
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              email: 'web@example.com',
              id: '00000000-0000-4000-8000-000000000003',
            },
          },
          error: null,
        }),
      },
    });

    const result = await requireHiveAccess(
      new NextRequest('https://tuturuuu.com/api/v1/hive/servers')
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access.isAdmin).toBe(true);
      expect(result.access.user.email).toBe('web@example.com');
    }
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.getHiveMemberByUserId).not.toHaveBeenCalled();
  });
});

describe('Hive event validation', () => {
  it('preserves block state payloads accepted by the Hive inspector', () => {
    const result = hiveEventSchema.safeParse({
      eventType: 'block.update',
      expectedRevision: 7,
      payload: { blockId: 'block:0:0:0' },
      world: {
        blocks: [
          {
            id: 'block:0:0:0',
            position: { x: 0, y: 0, z: 0 },
            state: { color: '#ffcc00' },
            type: 'crop-soil',
          },
        ],
        objects: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.world.blocks[0]?.state).toEqual({
      color: '#ffcc00',
    });
  });
});
