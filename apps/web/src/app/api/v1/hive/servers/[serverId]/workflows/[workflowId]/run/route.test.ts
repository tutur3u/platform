import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getHiveMemberByUserId: vi.fn(),
  runHiveWorkflow: vi.fn(),
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
  runHiveWorkflow: (...args: unknown[]) => mocks.runHiveWorkflow(...args),
}));

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

function hiveRunRequest() {
  const { token } = createAppSessionToken({
    email: 'hive@example.com',
    targetApp: 'hive',
    userId: '00000000-0000-4000-8000-000000000002',
  });

  return new NextRequest(
    'https://tuturuuu.com/api/v1/hive/servers/server-1/workflows/workflow-1/run',
    {
      body: JSON.stringify({ input: { mode: 'manual' } }),
      headers: {
        cookie: `tuturuuu_app_session=${token}`,
      },
      method: 'POST',
    }
  );
}

describe('Hive workflow run route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.createAdminClient.mockReset();
    mocks.getHiveMemberByUserId.mockReset();
    mocks.runHiveWorkflow.mockReset();
    mocks.createAdminClient.mockResolvedValue(createRoleClient(null));
    mocks.getHiveMemberByUserId.mockResolvedValue({ enabled: true });
    mocks.runHiveWorkflow.mockResolvedValue({
      id: 'run-1',
      status: 'completed',
      stepTrace: [],
      workflowId: 'workflow-1',
    });
  });

  it('lets enabled Hive members manually run a workflow', async () => {
    const { POST } = await import('./route');
    const response = await POST(hiveRunRequest(), {
      params: Promise.resolve({
        serverId: 'server-1',
        workflowId: 'workflow-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.runHiveWorkflow).toHaveBeenCalledWith({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      input: { mode: 'manual' },
      isAdmin: false,
      serverId: 'server-1',
      workflowId: 'workflow-1',
    });
  });
});
