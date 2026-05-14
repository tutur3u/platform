import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as approveAccessRequest } from './[requestId]/approve/route';
import {
  GET as getMyAccessRequest,
  POST as requestMyHiveAccess,
} from './me/route';
import { GET as listAccessRequests } from './route';

const mocks = vi.hoisted(() => ({
  approveHiveAccessRequest: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getHiveAccessRequestById: vi.fn(),
  getHiveAccessRequestByUserId: vi.fn(),
  getHiveMemberByUserId: vi.fn(),
  listHiveAccessRequests: vi.fn(),
  upsertHiveAccessRequest: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  approveHiveAccessRequest: (...args: unknown[]) =>
    mocks.approveHiveAccessRequest(...args),
  getHiveAccessRequestById: (...args: unknown[]) =>
    mocks.getHiveAccessRequestById(...args),
  getHiveAccessRequestByUserId: (...args: unknown[]) =>
    mocks.getHiveAccessRequestByUserId(...args),
  getHiveMemberByUserId: (...args: unknown[]) =>
    mocks.getHiveMemberByUserId(...args),
  listHiveAccessRequests: (...args: unknown[]) =>
    mocks.listHiveAccessRequests(...args),
  upsertHiveAccessRequest: (...args: unknown[]) =>
    mocks.upsertHiveAccessRequest(...args),
}));

const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_USER_ID = '00000000-0000-4000-8000-000000000002';
const REQUEST_ID = '00000000-0000-4000-8000-000000000003';

function createHiveRequest(
  userId = REQUEST_USER_ID,
  email = 'hive@example.com'
) {
  const { token } = createAppSessionToken({
    email,
    targetApp: 'hive',
    userId,
  });

  return {
    cookie: `tuturuuu_app_session=${token}`,
    email,
    userId,
  };
}

function createAccessRequestRow(
  overrides: Partial<{
    email: string | null;
    note: string | null;
    status: 'approved' | 'pending' | 'rejected';
    user_id: string;
  }> = {}
) {
  return {
    created_at: '2026-05-14T00:00:00.000Z',
    email: overrides.email ?? 'hive@example.com',
    id: REQUEST_ID,
    note: overrides.note ?? 'Research access',
    requested_at: '2026-05-14T00:00:00.000Z',
    resolution_note: null,
    resolved_at: null,
    resolved_by: null,
    status: overrides.status ?? 'pending',
    updated_at: '2026-05-14T00:00:00.000Z',
    user_id: overrides.user_id ?? REQUEST_USER_ID,
  };
}

function createMemberRow(userId = REQUEST_USER_ID) {
  return {
    created_at: '2026-05-14T00:01:00.000Z',
    enabled: true,
    id: '00000000-0000-4000-8000-000000000004',
    notes: 'Approved from Platform Roles',
    user_id: userId,
  };
}

function createAdminClient(
  role: { allow_role_management: boolean; enabled: boolean } | null = {
    allow_role_management: true,
    enabled: true,
  },
  syncError: { message: string } | null = null
) {
  const platformRoleLookup = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: role, error: null }),
      })),
    })),
  };
  const hiveMembersTable = {
    upsert: vi.fn().mockResolvedValue({ error: syncError }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'platform_user_roles') return platformRoleLookup;
      if (table === 'hive_members') return hiveMembersTable;
      throw new Error(`Unexpected table ${table}`);
    }),
    hiveMembersTable,
    platformRoleLookup,
  };
}

describe('Hive access request API', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets authenticated Hive users create a pending access request', async () => {
    const auth = createHiveRequest();
    const accessRequest = createAccessRequestRow();
    mocks.getHiveMemberByUserId.mockResolvedValue(null);
    mocks.upsertHiveAccessRequest.mockResolvedValue(accessRequest);

    const response = await requestMyHiveAccess(
      new NextRequest(
        'https://hive.tuturuuu.com/api/v1/hive/access-requests/me',
        {
          body: JSON.stringify({ note: 'Research access' }),
          headers: {
            'content-type': 'application/json',
            cookie: auth.cookie,
          },
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasAccess: false,
      request: {
        email: auth.email,
        note: 'Research access',
        status: 'pending',
        userId: auth.userId,
      },
      status: 'pending',
    });
    expect(mocks.upsertHiveAccessRequest).toHaveBeenCalledWith({
      email: auth.email,
      note: 'Research access',
      userId: auth.userId,
    });
  });

  it('returns success status once the requester already has Hive access', async () => {
    const auth = createHiveRequest();
    mocks.getHiveMemberByUserId.mockResolvedValue(createMemberRow(auth.userId));
    mocks.getHiveAccessRequestByUserId.mockResolvedValue(
      createAccessRequestRow({ user_id: auth.userId })
    );

    const response = await getMyAccessRequest(
      new NextRequest(
        'https://hive.tuturuuu.com/api/v1/hive/access-requests/me',
        {
          headers: {
            cookie: auth.cookie,
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasAccess: true,
      member: {
        enabled: true,
        userId: auth.userId,
      },
      status: 'approved',
    });
  });

  it('lists pending access requests for platform admins', async () => {
    const auth = createHiveRequest(ADMIN_USER_ID, 'admin@example.com');
    const adminClient = createAdminClient();
    const accessRequest = createAccessRequestRow();
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getHiveMemberByUserId.mockResolvedValue(null);
    mocks.listHiveAccessRequests.mockResolvedValue([accessRequest]);

    const response = await listAccessRequests(
      new NextRequest('https://tuturuuu.com/api/v1/hive/access-requests', {
        headers: {
          cookie: auth.cookie,
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      requests: [
        {
          email: 'hive@example.com',
          id: REQUEST_ID,
          status: 'pending',
          userId: REQUEST_USER_ID,
        },
      ],
    });
    expect(mocks.listHiveAccessRequests).toHaveBeenCalledWith({
      status: 'pending',
    });
  });

  it('approves requests by enabling both satellite and Hive database access', async () => {
    const auth = createHiveRequest(ADMIN_USER_ID, 'admin@example.com');
    const adminClient = createAdminClient();
    const accessRequest = createAccessRequestRow();
    const member = createMemberRow();
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getHiveMemberByUserId.mockResolvedValue(null);
    mocks.getHiveAccessRequestById.mockResolvedValue(accessRequest);
    mocks.approveHiveAccessRequest.mockResolvedValue({
      member,
      request: {
        ...accessRequest,
        resolution_note: 'Approved for research',
        resolved_at: '2026-05-14T00:02:00.000Z',
        resolved_by: ADMIN_USER_ID,
        status: 'approved',
      },
    });

    const response = await approveAccessRequest(
      new NextRequest(
        `https://tuturuuu.com/api/v1/hive/access-requests/${REQUEST_ID}/approve`,
        {
          body: JSON.stringify({ notes: 'Approved for research' }),
          headers: {
            'content-type': 'application/json',
            cookie: auth.cookie,
          },
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ requestId: REQUEST_ID }) }
    );

    expect(response.status).toBe(200);
    expect(adminClient.hiveMembersTable.upsert).toHaveBeenCalledWith(
      {
        enabled: true,
        notes: 'Approved for research',
        updated_at: expect.any(String),
        user_id: REQUEST_USER_ID,
      },
      { onConflict: 'user_id' }
    );
    expect(mocks.approveHiveAccessRequest).toHaveBeenCalledWith({
      approvedBy: ADMIN_USER_ID,
      notes: 'Approved for research',
      requestId: REQUEST_ID,
    });
    await expect(response.json()).resolves.toMatchObject({
      member: {
        enabled: true,
        userId: REQUEST_USER_ID,
      },
      request: {
        resolvedBy: ADMIN_USER_ID,
        status: 'approved',
      },
    });
  });
});
