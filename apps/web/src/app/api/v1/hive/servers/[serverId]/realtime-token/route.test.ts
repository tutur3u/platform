import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyHiveRealtimeToken } from '../../../_realtime-token';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getHiveMemberByUserId: vi.fn(),
  getHiveServer: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  getHiveMemberByUserId: (...args: unknown[]) =>
    mocks.getHiveMemberByUserId(...args),
  getHiveServer: (...args: unknown[]) => mocks.getHiveServer(...args),
}));

const ENABLED_SERVER_ID = '11111111-1111-4111-8111-111111111111';
const DISABLED_SERVER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '00000000-0000-4000-8000-000000000001';

function createRoleClient(
  role: {
    allow_role_management: boolean;
    enabled: boolean;
  } | null
) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: role, error: null }),
        })),
      })),
    })),
  };
}

function hiveRealtimeTokenRequest(serverId: string) {
  const { token } = createAppSessionToken({
    email: 'hive@example.com',
    targetApp: 'hive',
    userId: USER_ID,
  });

  return new NextRequest(
    `https://tuturuuu.com/api/v1/hive/servers/${serverId}/realtime-token`,
    {
      headers: {
        cookie: `tuturuuu_app_session=${token}`,
      },
      method: 'POST',
    }
  );
}

async function postRealtimeToken(serverId: string) {
  const { POST } = await import('./route');

  return POST(hiveRealtimeTokenRequest(serverId), {
    params: Promise.resolve({ serverId }),
  });
}

describe('Hive realtime token route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('HIVE_REALTIME_TOKEN_SECRET', 'test-realtime-secret');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-session-secret');
    mocks.createAdminClient.mockReset();
    mocks.createClient.mockReset();
    mocks.getHiveMemberByUserId.mockReset();
    mocks.getHiveServer.mockReset();
    mocks.createAdminClient.mockResolvedValue(createRoleClient(null));
    mocks.getHiveMemberByUserId.mockResolvedValue({ enabled: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects disabled servers for non-admin Hive members before signing tokens', async () => {
    mocks.getHiveServer.mockResolvedValue({
      enabled: false,
      id: DISABLED_SERVER_ID,
    });

    const response = await postRealtimeToken(DISABLED_SERVER_ID);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Hive server not found' });
    expect(mocks.getHiveServer).toHaveBeenCalledWith(DISABLED_SERVER_ID);
  });

  it('issues member tokens for enabled servers', async () => {
    mocks.getHiveServer.mockResolvedValue({
      enabled: true,
      id: ENABLED_SERVER_ID,
    });

    const response = await postRealtimeToken(ENABLED_SERVER_ID);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyHiveRealtimeToken(body.token)).toMatchObject({
      role: 'member',
      serverId: ENABLED_SERVER_ID,
      userId: USER_ID,
    });
  });

  it('allows Hive admins to issue tokens for disabled servers', async () => {
    mocks.createAdminClient.mockResolvedValueOnce(
      createRoleClient({ allow_role_management: true, enabled: true })
    );
    mocks.getHiveMemberByUserId.mockResolvedValueOnce(null);
    mocks.getHiveServer.mockResolvedValue({
      enabled: false,
      id: DISABLED_SERVER_ID,
    });

    const response = await postRealtimeToken(DISABLED_SERVER_ID);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyHiveRealtimeToken(body.token)).toMatchObject({
      role: 'admin',
      serverId: DISABLED_SERVER_ID,
      userId: USER_ID,
    });
  });
});
