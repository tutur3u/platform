import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createHiveWorkflow: vi.fn(),
  getHiveMemberByUserId: vi.fn(),
  listHiveWorkflows: vi.fn(),
  validateHiveWorkflowForPersistence: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: vi.fn(),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  getHiveMemberByUserId: (...args: unknown[]) =>
    mocks.getHiveMemberByUserId(...args),
}));

vi.mock('@/lib/hive/workflows', () => ({
  createHiveWorkflow: (...args: unknown[]) => mocks.createHiveWorkflow(...args),
  listHiveWorkflows: (...args: unknown[]) => mocks.listHiveWorkflows(...args),
  validateHiveWorkflowForPersistence: (...args: unknown[]) =>
    mocks.validateHiveWorkflowForPersistence(...args),
}));

function createAccessClient({
  member = { enabled: true },
  role = null,
}: {
  member?: { enabled: boolean } | null;
  role?: { allow_role_management: boolean; enabled: boolean } | null;
} = {}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === 'hive_members' ? member : role,
            error: null,
          }),
        })),
      })),
    })),
  };
}

function hiveRequest(method: 'GET' | 'POST', body?: unknown) {
  const { token } = createAppSessionToken({
    email: 'hive@example.com',
    targetApp: 'hive',
    userId: '00000000-0000-4000-8000-000000000001',
  });

  return new NextRequest(
    'https://tuturuuu.com/api/v1/hive/servers/server-1/workflows',
    {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        cookie: `tuturuuu_app_session=${token}`,
      },
      method,
    }
  );
}

const definition = {
  edges: [],
  nodes: [
    {
      data: { label: 'Manual run' },
      id: 'trigger',
      position: { x: 0, y: 0 },
      type: 'manual_trigger',
    },
  ],
  version: 1,
};

describe('Hive workflow collection route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.createAdminClient.mockReset();
    mocks.createHiveWorkflow.mockReset();
    mocks.getHiveMemberByUserId.mockReset();
    mocks.listHiveWorkflows.mockReset();
    mocks.validateHiveWorkflowForPersistence.mockReset();
    mocks.createAdminClient.mockResolvedValue(createAccessClient());
    mocks.getHiveMemberByUserId.mockResolvedValue({ enabled: true });
    mocks.listHiveWorkflows.mockResolvedValue([]);
    mocks.validateHiveWorkflowForPersistence.mockReturnValue({
      errors: [],
      ok: true,
    });
  });

  it('lets Hive members list enabled workflows', async () => {
    const { GET } = await import('./route');

    const response = await GET(hiveRequest('GET'), {
      params: Promise.resolve({ serverId: 'server-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.listHiveWorkflows).toHaveBeenCalledWith({
      isAdmin: false,
      serverId: 'server-1',
    });
  });

  it('rejects member workflow creation and allows platform admins', async () => {
    const { POST } = await import('./route');
    mocks.createAdminClient.mockResolvedValueOnce(createAccessClient());

    const rejected = await POST(
      hiveRequest('POST', {
        definition,
        enabled: true,
        name: 'Daily loop',
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(rejected.status).toBe(403);
    expect(mocks.createHiveWorkflow).not.toHaveBeenCalled();

    mocks.createAdminClient.mockResolvedValueOnce(
      createAccessClient({
        member: null,
        role: { allow_role_management: true, enabled: true },
      })
    );
    mocks.createHiveWorkflow.mockResolvedValue({
      definition,
      id: 'workflow-1',
      name: 'Daily loop',
      serverId: 'server-1',
    });

    const created = await POST(
      hiveRequest('POST', {
        definition,
        enabled: true,
        name: 'Daily loop',
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(created.status).toBe(201);
    expect(mocks.createHiveWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: '00000000-0000-4000-8000-000000000001',
        serverId: 'server-1',
      })
    );
  });
});
