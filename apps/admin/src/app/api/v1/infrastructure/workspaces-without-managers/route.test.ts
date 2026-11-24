// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

import { GET } from './route';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const CREATOR = '33333333-3333-4333-8333-333333333333';

function rpcRow(wsId: string) {
  return {
    created_at: '2026-01-02T03:04:05.000Z',
    creator_id: CREATOR,
    full_member_count: 4,
    ws_id: wsId,
    ws_name: `Workspace ${wsId.slice(0, 2)}`,
  };
}

function request(query = '') {
  return new Request(
    `http://localhost/api/v1/infrastructure/workspaces-without-managers${query}`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: { schema: mocks.schema },
    user: { id: '44444444-4444-4444-8444-444444444444' },
  });
});

describe('workspaces without managers route', () => {
  it('rejects non-admins with 403 before calling the RPC', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'manage_workspace_roles',
      true,
      expect.any(Request)
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls the private RPC with the cursor and limit and maps rows', async () => {
    mocks.rpc.mockResolvedValue({ data: [rpcRow(WS_B)], error: null });

    const response = await GET(request(`?after=${WS_A}&limit=10`));

    expect(response.status).toBe(200);
    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_workspaces_without_member_manager',
      { p_after_ws_id: WS_A, p_limit: 10 }
    );
    await expect(response.json()).resolves.toEqual({
      nextCursor: null,
      workspaces: [
        {
          createdAt: '2026-01-02T03:04:05.000Z',
          creatorId: CREATOR,
          fullMemberCount: 4,
          name: 'Workspace 22',
          wsId: WS_B,
        },
      ],
    });
  });

  it('starts from the first page with the default limit', async () => {
    await GET(request());

    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_workspaces_without_member_manager',
      { p_after_ws_id: undefined, p_limit: 50 }
    );
  });

  it('returns the last ws_id as the next cursor when a full page returns', async () => {
    mocks.rpc.mockResolvedValue({
      data: [rpcRow(WS_A), rpcRow(WS_B)],
      error: null,
    });

    const response = await GET(request('?limit=2'));

    await expect(response.json()).resolves.toMatchObject({
      nextCursor: WS_B,
    });
  });

  it.each([
    ['?after=not-a-uuid', 'invalid_cursor'],
    ['?after=', 'invalid_cursor'],
    ['?limit=0', 'invalid_limit'],
    ['?limit=101', 'invalid_limit'],
    ['?limit=1.5', 'invalid_limit'],
    ['?limit=abc', 'invalid_limit'],
  ])('rejects %s with 400', async (query, error) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking the database error', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'relation private.secret does not exist' },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('private.secret');
    expect(console.error).toHaveBeenCalled();
  });
});
