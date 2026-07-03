import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const NORMALIZED_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => {
  const hasPermission = vi.fn(() => true);
  const resolveWorkspace = vi.fn(
    async () => '22222222-2222-4222-8222-222222222222'
  );
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  const serverLoggerError = vi.fn();

  return {
    adminSupabase: { schema },
    hasPermission,
    resolveWorkspace,
    rpc,
    schema,
    serverLoggerError,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.adminSupabase),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();

  return {
    ...actual,
    getPermissions: vi.fn(async () => ({
      containsPermission: mocks.hasPermission,
    })),
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspace,
}));

function createRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/users/indicators/groups/migrate`,
    {
      body: typeof body === 'string' ? body : JSON.stringify(body),
      method: 'PUT',
    }
  );
}

function createParams() {
  return {
    params: Promise.resolve({ wsId: WORKSPACE_ID }),
  };
}

describe('user group metric category migrate route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.hasPermission.mockReturnValue(true);
    mocks.resolveWorkspace.mockResolvedValue(NORMALIZED_WORKSPACE_ID);
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  it('migrates valid categories through the private workspace-bound RPC', async () => {
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(
      createRequest({
        groups: [
          {
            created_at: '2026-06-01T00:00:00.000Z',
            description: 'Original description',
            id: CATEGORY_ID,
            name: 'Vitals',
            note: 'Original note',
            unexpected: 'ignored',
            ws_id: 'victim-workspace',
          },
        ],
      }),
      createParams()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_upsert_user_group_metric_categories_for_workspace',
      {
        p_categories: [
          {
            created_at: '2026-06-01T00:00:00.000Z',
            description: 'Original description',
            id: CATEGORY_ID,
            name: 'Vitals',
            note: 'Original note',
          },
        ],
        p_ws_id: NORMALIZED_WORKSPACE_ID,
      }
    );
  });

  it('rejects malformed category payloads before creating an admin client', async () => {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(
      createRequest({
        groups: [{ id: 'not-a-uuid', name: 'Vitals' }],
      }),
      createParams()
    );

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects duplicate category IDs before creating an admin client', async () => {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(
      createRequest({
        groups: [
          { id: CATEGORY_ID, name: 'Vitals' },
          { id: CATEGORY_ID.toUpperCase(), name: 'Duplicate' },
        ],
      }),
      createParams()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      id: CATEGORY_ID.toUpperCase(),
      message: 'Duplicate metric category id',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects callers without score creation permission before creating an admin client', async () => {
    mocks.hasPermission.mockReturnValueOnce(false);
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(
      createRequest({
        groups: [{ id: CATEGORY_ID, name: 'Vitals' }],
      }),
      createParams()
    );

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns not found when the private RPC rejects a foreign workspace category id', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0002', message: 'metric_category_not_found' },
    });
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(
      createRequest({
        groups: [{ id: SECOND_CATEGORY_ID, name: 'Foreign category' }],
      }),
      createParams()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Metric category not found',
    });
  });

  it('rejects malformed JSON before creating an admin client', async () => {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const { PUT } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/users/indicators/groups/migrate/route'
    );

    const response = await PUT(createRequest('{'), createParams());

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
